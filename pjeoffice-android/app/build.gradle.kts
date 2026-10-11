import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Assinatura do APK de release: use um keystore próprio pelas variáveis de
// ambiente abaixo (o workflow do GitHub lê de secrets). Sem elas, o release
// sai assinado com a chave de debug, só para testes.
val keystoreArquivo = System.getenv("ASSINADOR_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "io.github.harleygimenez.assinadorpje"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.harleygimenez.assinadorpje"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1)
        versionName = "0.1.${System.getenv("GITHUB_RUN_NUMBER") ?: "0"}"
    }

    signingConfigs {
        if (keystoreArquivo != null) {
            create("release") {
                storeFile = keystoreArquivo
                storePassword = System.getenv("ASSINADOR_KEYSTORE_SENHA")
                keyAlias = System.getenv("ASSINADOR_CHAVE_ALIAS")
                keyPassword = System.getenv("ASSINADOR_CHAVE_SENHA")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(project(":core"))
}
