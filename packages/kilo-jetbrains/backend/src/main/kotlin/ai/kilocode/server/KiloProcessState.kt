package ai.kilocode.server

sealed class KiloProcessState {
    data class Ready(val port: Int, val password: String) : KiloProcessState()
    data class Error(val message: String, val details: String? = null) : KiloProcessState()
}
