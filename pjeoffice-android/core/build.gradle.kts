import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Núcleo do protocolo em Kotlin puro (sem Android), testado na JVM.
plugins {
    id("org.jetbrains.kotlin.jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_11)
    }
}

dependencies {
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    // Os testes do servidor local enviam o cabeçalho Origin, que o HttpURLConnection bloqueia por padrão.
    systemProperty("sun.net.http.allowRestrictedHeaders", "true")
}
