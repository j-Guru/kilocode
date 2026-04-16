rootProject.name = "kilo.jetbrains"

include("shared")
include("frontend")
include("backend")

pluginManagement {
    includeBuild("build-tasks")
    repositories {
        mavenCentral()
        gradlePluginPortal()
        maven("https://packages.jetbrains.team/maven/p/ij/intellij-dependencies/")
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
