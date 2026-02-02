export const CODING_PROFILE = `
# Kotlin/Android Coding Profile

## SDK, Gradle, and Kotlin Versions
- Gradle: As specified in task spec
- Kotlin: As specified in task spec
- JVM Target: 17
- Min SDK: As specified in task spec
- Target SDK: As specified in task spec
- Compile SDK: Same as target SDK

## Kotlin File Rules
- Package declaration must be first non-comment line
- Package must match directory structure
- Imports after package, sorted alphabetically
- No wildcard imports
- Single public class per file (exception: sealed class hierarchies)
- PascalCase for classes, camelCase for functions/properties
- 4-space indentation, no tabs
- Explicit null handling, prefer non-null types
- Explicit visibility modifiers (public/private/internal)

## XML File Rules (Views UI)
- Root element must match file purpose
- Declare android, app, tools namespaces on root
- Use @+id/ for new IDs with camelCase naming
- Use dp for layout dimensions, sp for text
- Reference @color/ and @string/ resources
- No hardcoded values

## Compose Rules
- Composable functions in PascalCase
- Annotate with @Composable
- Use remember, mutableStateOf, collectAsState for state
- Include @Preview function for each screen composable
- Chain modifiers fluently, no intermediate variables

## Gradle Build File Rules
- Use Kotlin DSL (.gradle.kts)
- Plugins block at top using id() DSL
- Android block: configure compileSdk, minSdk, targetSdk, kotlinOptions
- Group dependencies by type (implementation, testImplementation, etc.)
- Use explicit versions, no + wildcards

## AndroidManifest.xml Rules
- Package must match app_name and package structure
- Declare required permissions (INTERNET, etc.)
- Application tag: include android:name, android:icon, android:theme
- Activity tags: include main activity with LAUNCHER intent-filter

## Required Dependencies
- AndroidX Core KTX
- AndroidX AppCompat
- Material Design Components
- Jetpack Compose (if ui_system=Compose)
- AndroidX Lifecycle (ViewModel, LiveData)
- AndroidX Navigation (if multi-screen)
- Kotlin Coroutines
- Kotlin Serialization (if network/data)

## Forbidden Patterns
### Deprecated APIs
- No android.support.* (use AndroidX)
- No AsyncTask (use Coroutines)
- No Handler.postDelayed (use CoroutineScope.launch with delay)
- No ProgressDialog (use Material Design progress indicators)

### Security Violations
- No hardcoded API keys/URLs (use BuildConfig or local.properties)
- Use HTTPS only, no HTTP in production
- All exported components explicitly declared in manifest

### Performance Anti-Patterns
- No UI work on main thread (use Coroutines with Dispatchers.IO or Dispatchers.Default)
- No blocking calls except in main() or tests
- No Activity/Fragment references in long-lived objects (memory leaks)

### Compose-Specific Violations
- No var state in Composable (use mutableStateOf)
- Use LaunchedEffect, DisposableEffect, SideEffect appropriately
- No expensive operations directly in Composable body

## Critic Rejection Criteria
### BLOCKER (Must Reject)
- Syntax error preventing compilation
- Missing required Android component (Activity, ViewModel, etc.)
- Incorrect superclass
- Invalid Android API usage
- Unresolved import or dependency
- Missing @Composable annotation for Compose function
- Incorrect Gradle plugin or missing plugin
- Missing or malformed AndroidManifest.xml

### MAJOR (Should Reject)
- Incorrect architecture pattern (e.g., mixing MVI and MVVM)
- Missing null checks
- Poor error handling (empty catch blocks)
- Hardcoded strings/colors/dimensions
- Missing lifecycle handling
- Incorrect Coroutine scope (GlobalScope instead of viewModelScope)

### MINOR (Accept; Log Warning)
- Verbose code
- Missing edge case handling (non-critical)
- Suboptimal performance
- Missing Compose preview
`;
