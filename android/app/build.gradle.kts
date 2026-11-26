import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// One version for every platform: package.json at the repo root.
val pkgVersion = (JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val vParts = pkgVersion.split(".").map { it.toInt() }
val pkgVersionCode = vParts[0] * 10000 + vParts[1] * 100 + vParts[2]

android {
    namespace = "com.halyra.focus"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.halyra.focus"
        minSdk = 26
        targetSdk = 35
        versionCode = pkgVersionCode
        versionName = pkgVersion
    }

    signingConfigs {
        create("release") {
            // CI passes a private key through secrets when one is configured;
            // otherwise the project's own release key is used.
            storeFile = file(System.getenv("HF_KEYSTORE") ?: "../signing/halyra-focus.jks")
            storePassword = System.getenv("HF_KEYSTORE_PASSWORD") ?: "halyra-focus"
            keyAlias = System.getenv("HF_KEY_ALIAS") ?: "halyra"
            keyPassword = System.getenv("HF_KEY_PASSWORD") ?: "halyra-focus"
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ""
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
