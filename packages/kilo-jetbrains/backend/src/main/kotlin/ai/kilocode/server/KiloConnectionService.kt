package ai.kilocode.server

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.Base64
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

sealed class ConnectionState {
    data object Disconnected : ConnectionState()
    data object Connecting : ConnectionState()
    data class Connected(val port: Int, val password: String) : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}

data class SseEvent(val type: String, val data: String)

@Service(Service.Level.APP)
class KiloConnectionService(private val cs: CoroutineScope) : Disposable {

    companion object {
        private val LOG = Logger.getInstance(KiloConnectionService::class.java)
        private const val HEARTBEAT_TIMEOUT_MS = 15_000L
        private const val HEALTH_POLL_INTERVAL_MS = 10_000L
        private const val HEALTH_TIMEOUT_MS = 3_000L
        private const val RECONNECT_DELAY_MS = 250L
        private val TYPE_REGEX = Regex(""""type"\s*:\s*"([^"]+)"""")
    }

    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<SseEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<SseEvent> = _events.asSharedFlow()

    private var client: OkHttpClient? = null
    private var port = 0
    private var password = ""

    private val source = AtomicReference<EventSource?>(null)
    private val lastEvent = AtomicLong(0L)
    private var heartbeatJob: Job? = null
    private var healthJob: Job? = null
    private var processJob: Job? = null
    private var reconnectJob: Job? = null

    suspend fun connect() {
        if (_state.value is ConnectionState.Connected || _state.value is ConnectionState.Connecting) return

        setState(ConnectionState.Connecting)

        val cliService = service<KiloCliService>()
        val processState = cliService.init()

        if (processState is KiloProcessState.Error) {
            setState(ConnectionState.Error(processState.message))
            return
        }

        val ready = processState as KiloProcessState.Ready
        port = ready.port
        password = ready.password

        client = OkHttpClient.Builder()
            .addInterceptor { chain ->
                val auth = Base64.getEncoder().encodeToString("kilo:$password".toByteArray())
                chain.proceed(
                    chain.request().newBuilder()
                        .header("Authorization", "Basic $auth")
                        .build()
                )
            }
            .callTimeout(HEALTH_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .build()

        startSse()
        startHeartbeatWatcher()
        healthJob = healthLoop()
        cliService.process()?.let { proc ->
            processJob = monitorProcess(proc)
        }
    }

    private fun startSse() {
        val http = client ?: return
        val request = Request.Builder()
            .url("http://127.0.0.1:$port/global/event")
            .header("Accept", "text/event-stream")
            .build()

        val factory = EventSources.createFactory(
            http.newBuilder()
                .callTimeout(0, TimeUnit.MILLISECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build()
        )
        source.set(factory.newEventSource(request, listener))
        LOG.info("SSE: connecting to port $port")
    }

    private val listener = object : EventSourceListener() {
        override fun onOpen(src: EventSource, response: Response) {
            LOG.info("SSE: connected")
            setState(ConnectionState.Connected(port, password))
            lastEvent.set(System.currentTimeMillis())
        }

        override fun onEvent(src: EventSource, id: String?, type: String?, data: String) {
            lastEvent.set(System.currentTimeMillis())
            val eventType = type ?: extractType(data)
            cs.launch { _events.emit(SseEvent(type = eventType, data = data)) }
        }

        override fun onClosed(src: EventSource) {
            LOG.info("SSE: stream closed — scheduling reconnect")
            scheduleReconnect()
        }

        override fun onFailure(src: EventSource, t: Throwable?, response: Response?) {
            if (t != null) {
                LOG.warn("SSE: failure (${t.message}) — scheduling reconnect")
            } else {
                LOG.warn("SSE: failure (HTTP ${response?.code}) — scheduling reconnect")
            }
            setState(ConnectionState.Error(t?.message ?: "SSE connection failed (HTTP ${response?.code})"))
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true) return
        reconnectJob = cs.launch {
            delay(RECONNECT_DELAY_MS)
            if (isActive) {
                LOG.info("SSE: reconnecting")
                setState(ConnectionState.Connecting)
                startSse()
            }
        }
    }

    private fun startHeartbeatWatcher() {
        heartbeatJob?.cancel()
        heartbeatJob = cs.launch {
            while (isActive) {
                delay(1_000)
                if (_state.value !is ConnectionState.Connected) continue
                val elapsed = System.currentTimeMillis() - lastEvent.get()
                if (elapsed > HEARTBEAT_TIMEOUT_MS) {
                    LOG.warn("SSE: heartbeat timeout (${elapsed}ms) — forcing reconnect")
                    source.getAndSet(null)?.cancel()
                    scheduleReconnect()
                }
            }
        }
    }

    private fun healthLoop() = cs.launch(Dispatchers.IO) {
        while (isActive) {
            delay(HEALTH_POLL_INTERVAL_MS)
            if (_state.value !is ConnectionState.Connected) continue
            val ok = checkHealth()
            if (!ok && _state.value is ConnectionState.Connected) {
                LOG.warn("Health check failed — forcing SSE reconnect")
                source.getAndSet(null)?.cancel()
                scheduleReconnect()
            }
        }
    }

    private fun checkHealth(): Boolean {
        val http = client ?: return false
        return try {
            val req = Request.Builder()
                .url("http://127.0.0.1:$port/global/health")
                .build()
            http.newCall(req).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            LOG.info("Health check exception: ${e.message}")
            false
        }
    }

    private fun monitorProcess(proc: Process) = cs.launch(Dispatchers.IO) {
        proc.waitFor()
        val code = proc.exitValue()
        LOG.warn("CLI process exited with code $code")
        source.getAndSet(null)?.cancel()
        setState(ConnectionState.Error("CLI process exited with code $code"))
    }

    private fun setState(next: ConnectionState) {
        _state.value = next
    }

    private fun extractType(data: String): String =
        TYPE_REGEX.find(data)?.groupValues?.get(1) ?: "unknown"

    override fun dispose() {
        source.getAndSet(null)?.cancel()
        heartbeatJob?.cancel()
        healthJob?.cancel()
        processJob?.cancel()
        reconnectJob?.cancel()
        client?.let { http ->
            http.dispatcher.executorService.shutdown()
            http.connectionPool.evictAll()
        }
        client = null
        setState(ConnectionState.Disconnected)
        LOG.info("KiloConnectionService disposed")
    }
}
