# Kotlin/Android Coding Profile

This document defines the coding standards enforced by the Critic agent.

## SDK, Gradle, and Kotlin Versions

- **Gradle:** As specified in task spec
- **Kotlin:** As specified in task spec
- **JVM Target:** 17
- **Min SDK:** As specified in task spec
- **Target SDK:** As specified in task spec
- **Compile SDK:** Same as target SDK

## Kotlin File Rules

### Package Declaration

```kotlin
package com.example.myapp  // First non-comment line

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.Flow
// Sorted alphabetically, no wildcards

class MyViewModel : ViewModel() {
    // ...
}
```

### Naming Conventions

- **Classes:** PascalCase (`MyViewModel`, `LoginActivity`)
- **Functions:** camelCase (`getUserData`, `performLogin`)
- **Properties:** camelCase (`userName`, `isLoggedIn`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_RETRY_COUNT`)

### Indentation

- **4 spaces** per level
- **No tabs**

### Null Safety

```kotlin
// Prefer non-null types
var name: String = ""

// Explicit null handling
var optionalName: String? = null
val length = optionalName?.length ?: 0
```

### Visibility Modifiers

```kotlin
public class MyClass        // Explicit
private fun helperMethod()  // Explicit
internal val sharedValue    // Explicit
```

## XML File Rules (Views UI)

### Layout Files

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <TextView
        android:id="@+id/titleText"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="@string/app_name"
        android:textSize="@dimen/text_large" />

</LinearLayout>
```

### Resource References

- **IDs:** `@+id/camelCaseName`
- **Strings:** `@string/string_name`
- **Colors:** `@color/color_name`
- **Dimensions:** `@dimen/dimen_name`
- **No hardcoded values**

## Compose Rules

### Composable Functions

```kotlin
@Composable
fun MyScreen(viewModel: MyViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(text = state.title)
    }
}

@Preview
@Composable
fun MyScreenPreview() {
    MyScreen()
}
```

### State Management

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }
    
    Button(onClick = { count++ }) {
        Text("Count: $count")
    }
}
```

### Side Effects

```kotlin
@Composable
fun MyScreen(userId: String) {
    LaunchedEffect(userId) {
        // Fetch data when userId changes
    }
    
    DisposableEffect(Unit) {
        // Setup
        onDispose {
            // Cleanup
        }
    }
}
```

## Gradle Build Files

### Project-level build.gradle.kts

```kotlin
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
}
```

### App-level build.gradle.kts

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.myapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.myapp"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
}
```

## AndroidManifest.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.myapp">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".MyApplication"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.MyApp">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>

</manifest>
```

## Required Dependencies

### Core

```kotlin
implementation("androidx.core:core-ktx:1.12.0")
implementation("androidx.appcompat:appcompat:1.6.1")
implementation("com.google.android.material:material:1.11.0")
```

### Compose

```kotlin
implementation(platform("androidx.compose:compose-bom:2024.01.00"))
implementation("androidx.compose.ui:ui")
implementation("androidx.compose.material3:material3")
implementation("androidx.activity:activity-compose:1.8.2")
```

### Lifecycle

```kotlin
implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")
implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.7.0")
```

### Coroutines

```kotlin
implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
```

## Forbidden Patterns

### Deprecated APIs

❌ **Don't use:**
```kotlin
import android.support.v7.app.AppCompatActivity  // Old support library
class MyTask : AsyncTask<Void, Void, String>()   // Deprecated
```

✅ **Use instead:**
```kotlin
import androidx.appcompat.app.AppCompatActivity  // AndroidX
viewModelScope.launch { /* coroutine */ }        // Coroutines
```

### Security Violations

❌ **Don't hardcode:**
```kotlin
val API_KEY = "sk-1234567890"  // Never!
val BASE_URL = "http://api.example.com"  // Use HTTPS
```

✅ **Use BuildConfig:**
```kotlin
val API_KEY = BuildConfig.API_KEY
val BASE_URL = "https://api.example.com"
```

### Performance Anti-Patterns

❌ **Don't block main thread:**
```kotlin
fun loadData() {
    val data = database.query()  // Blocks UI!
    updateUI(data)
}
```

✅ **Use Coroutines:**
```kotlin
fun loadData() {
    viewModelScope.launch {
        val data = withContext(Dispatchers.IO) {
            database.query()
        }
        updateUI(data)
    }
}
```

### Compose Anti-Patterns

❌ **Don't use var state:**
```kotlin
@Composable
fun Counter() {
    var count = 0  // Won't recompose!
}
```

✅ **Use mutableStateOf:**
```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }
}
```

## Critic Rejection Criteria

### BLOCKER (Must Reject)

- Syntax error preventing compilation
- Missing required Android component (Activity, ViewModel, etc.)
- Incorrect superclass (e.g., Fragment extends Activity)
- Invalid Android API usage
- Unresolved import or dependency
- Missing `@Composable` annotation for Compose function
- Incorrect Gradle plugin or missing plugin
- Missing or malformed AndroidManifest.xml

### MAJOR (Should Reject)

- Incorrect architecture pattern (mixing MVI and MVVM)
- Missing null checks in Kotlin code
- Poor error handling (empty catch blocks)
- Hardcoded strings/colors/dimensions
- Missing lifecycle handling
- Incorrect Coroutine scope (GlobalScope instead of viewModelScope)

### MINOR (Accept; Log Warning)

- Verbose code (unnecessary intermediate variables)
- Missing edge case handling (non-critical)
- Suboptimal performance (unnecessary recomposition)
- Missing Compose preview
