package ai.kilocode.server

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.system.CpuArch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

/**
 * Application-level service that manages the Kilo CLI binary lifecycle.
 *
 * Extracts the bundled CLI from JAR resources into IntelliJ's system directory,
 * spawns `kilo serve --port 0`, and exposes the result as [KiloProcessState].
 *
 * All concurrent callers of [init] share the same startup flow — only one
 * CLI process is ever spawned.
 */
@Service(Service.Level.APP)
class KiloCliService(private val cs: CoroutineScope) : Disposable {

    companion object {
        private val LOG = Logger.getInstance(KiloCliService::class.java)
        private const val STARTUP_TIMEOUT_MS = 30_000L
        private const val KILL_TIMEOUT_SECONDS = 5L
        private val PORT_REGEX = Regex("""listening on http://[\w.]+:(\d+)""")
    }

    private val mutex = Mutex()
    private var pending: Deferred<KiloProcessState>? = null
    private var process: Process? = null

    fun process(): Process? = process

    suspend fun init(): KiloProcessState {
        mutex.withLock {
            pending?.let { return@withLock }
            pending = cs.async(Dispatchers.IO) { start() }
        }
        return pending!!.await()
    }

    private suspend fun start(): KiloProcessState {
        return try {
            val path = extractCli()
            withTimeout(STARTUP_TIMEOUT_MS) {
                spawn(path)
            }
        } catch (e: Exception) {
            LOG.warn("CLI startup failed", e)
            KiloProcessState.Error(
                message = e.message ?: "Unknown error",
                details = e.stackTraceToString(),
            )
        }
    }

    private suspend fun extractCli(): File = withContext(Dispatchers.IO) {
        val platform = platform()
        val exe = if (SystemInfo.isWindows) "kilo.exe" else "kilo"
        val resource = "/cli/$platform/$exe"
        val target = File(PathManager.getSystemPath(), "kilo/bin/$exe")

        val stream = javaClass.getResourceAsStream(resource)
            ?: throw IllegalStateException("CLI binary not found in JAR resources at $resource")

        val size = stream.use { it.available().toLong() }
        if (target.exists() && target.length() == size) {
            LOG.info("CLI binary up-to-date at ${target.absolutePath}")
            return@withContext target
        }

        LOG.info("Extracting CLI binary to ${target.absolutePath}")
        target.parentFile.mkdirs()

        javaClass.getResourceAsStream(resource)!!.use { input ->
            target.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        if (!SystemInfo.isWindows) {
            target.setExecutable(true)
        }

        target
    }

    private suspend fun spawn(cli: File): KiloProcessState = withContext(Dispatchers.IO) {
        val pwd = generatePassword()

        val env = buildMap {
            putAll(System.getenv())
            put("KILO_SERVER_PASSWORD", pwd)
            put("KILO_CLIENT", "jetbrains")
            put("KILO_ENABLE_QUESTION_TOOL", "true")
            put("KILO_PLATFORM", "jetbrains")
            put("KILO_APP_NAME", "kilo-code")
        }

        val builder = ProcessBuilder(cli.absolutePath, "serve", "--port", "0")
        builder.environment().clear()
        builder.environment().putAll(env)
        builder.redirectErrorStream(false)

        LOG.info("Spawning: ${cli.absolutePath} serve --port 0")
        val proc = builder.start()
        process = proc

        val stderr = StringBuilder()

        Thread({
            BufferedReader(InputStreamReader(proc.errorStream)).use { reader ->
                reader.lineSequence().forEach { line ->
                    LOG.warn("CLI stderr: $line")
                    synchronized(stderr) { stderr.appendLine(line) }
                }
            }
        }, "kilo-cli-stderr").apply { isDaemon = true; start() }

        BufferedReader(InputStreamReader(proc.inputStream)).use { reader ->
            for (line in reader.lineSequence()) {
                LOG.info("CLI stdout: $line")
                val match = PORT_REGEX.find(line)
                if (match != null) {
                    val p = match.groupValues[1].toInt()
                    LOG.info("CLI server ready on port $p")
                    return@withContext KiloProcessState.Ready(port = p, password = pwd)
                }

                if (!proc.isAlive) break
            }
        }

        val code = proc.waitFor()
        val details = synchronized(stderr) { stderr.toString().trim() }
        process = null
        KiloProcessState.Error(
            message = "CLI process exited with code $code before announcing a port",
            details = details.ifEmpty { null },
        )
    }

    override fun dispose() {
        val proc = process ?: return
        process = null
        pending = null

        LOG.info("Disposing — killing CLI process (pid ${proc.pid()})")
        proc.destroy()

        if (!proc.waitFor(KILL_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
            LOG.warn("CLI process did not exit after SIGTERM, sending SIGKILL")
            proc.destroyForcibly()
        }
    }

    private fun platform(): String {
        val os = when {
            SystemInfo.isMac -> "darwin"
            SystemInfo.isLinux -> "linux"
            SystemInfo.isWindows -> "windows"
            else -> throw IllegalStateException("Unsupported OS: ${System.getProperty("os.name")}")
        }
        val arch = when (CpuArch.CURRENT) {
            CpuArch.ARM64 -> "arm64"
            CpuArch.X86_64 -> "x64"
            else -> throw IllegalStateException("Unsupported architecture: ${CpuArch.CURRENT}")
        }
        return "$os-$arch"
    }

    private fun generatePassword(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
