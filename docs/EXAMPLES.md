# Task Examples

## Simple Todo App (Compose)

### Specification

```json
{
  "app_name": "TodoApp",
  "features": [
    "add_task",
    "list_tasks",
    "complete_task",
    "delete_task"
  ],
  "architecture": "MVVM",
  "ui_system": "Compose",
  "min_sdk": 24,
  "target_sdk": 34,
  "gradle_version": "8.2.0",
  "kotlin_version": "1.9.20"
}
```

### Expected Output

**Files:**
- `MainActivity.kt`: Entry point with Compose setup
- `TodoViewModel.kt`: State management
- `TodoRepository.kt`: Data layer
- `TodoScreen.kt`: Main Composable
- `TodoItem.kt`: List item Composable
- `build.gradle.kts`: Dependencies and configuration
- `AndroidManifest.xml`: App configuration

**Features:**
- Add new todo items
- Display list of todos
- Mark todos as complete
- Delete todos

### Command

```bash
node dist/index.js agent --message 'build app: {"app_name":"TodoApp","features":["add_task","list_tasks","complete_task","delete_task"],"architecture":"MVVM","ui_system":"Compose","min_sdk":24,"target_sdk":34,"gradle_version":"8.2.0","kotlin_version":"1.9.20"}'
```

## E-commerce App (Views)

### Specification

```json
{
  "app_name": "ShopApp",
  "features": [
    "product_list",
    "product_detail",
    "search",
    "cart",
    "checkout"
  ],
  "architecture": "MVP",
  "ui_system": "Views",
  "min_sdk": 21,
  "target_sdk": 33,
  "gradle_version": "8.1.0",
  "kotlin_version": "1.9.10"
}
```

### Expected Output

**Files:**
- `ProductListActivity.kt`: Product browsing
- `ProductDetailActivity.kt`: Product details
- `SearchActivity.kt`: Search functionality
- `CartActivity.kt`: Shopping cart
- `CheckoutActivity.kt`: Checkout flow
- `ProductPresenter.kt`: Presentation logic
- `activity_product_list.xml`: Layout files
- `build.gradle.kts`: Dependencies
- `AndroidManifest.xml`: Activities declared

**Features:**
- Browse products in list
- View product details
- Search products
- Add to cart
- Checkout process

## Weather App (MVI)

### Specification

```json
{
  "app_name": "WeatherApp",
  "features": [
    "current_weather",
    "forecast",
    "location_search",
    "favorites"
  ],
  "architecture": "MVI",
  "ui_system": "Compose",
  "min_sdk": 24,
  "target_sdk": 34,
  "gradle_version": "8.2.0",
  "kotlin_version": "1.9.20"
}
```

### Expected Output

**Files:**
- `WeatherIntent.kt`: User intents
- `WeatherState.kt`: UI state
- `WeatherViewModel.kt`: State machine
- `WeatherScreen.kt`: Main Composable
- `ForecastCard.kt`: Forecast display
- `build.gradle.kts`: Dependencies
- `AndroidManifest.xml`: Permissions

**Features:**
- Show current weather
- Display 7-day forecast
- Search locations
- Save favorite locations

## Notes App (Minimal)

### Specification

```json
{
  "app_name": "NotesApp",
  "features": [
    "create_note",
    "list_notes",
    "edit_note"
  ],
  "architecture": "MVVM",
  "ui_system": "Compose",
  "min_sdk": 24,
  "target_sdk": 34,
  "gradle_version": "8.2.0",
  "kotlin_version": "1.9.20"
}
```

### Expected Output

**Files:**
- `MainActivity.kt`
- `NoteViewModel.kt`
- `NoteScreen.kt`
- `NoteEditor.kt`
- `build.gradle.kts`
- `AndroidManifest.xml`

**Features:**
- Create new notes
- List all notes
- Edit existing notes

## Recipe App (Complex)

### Specification

```json
{
  "app_name": "RecipeApp",
  "features": [
    "browse_recipes",
    "recipe_detail",
    "search_recipes",
    "filter_by_category",
    "favorites",
    "shopping_list",
    "cooking_timer"
  ],
  "architecture": "MVVM",
  "ui_system": "Compose",
  "min_sdk": 24,
  "target_sdk": 34,
  "gradle_version": "8.2.0",
  "kotlin_version": "1.9.20"
}
```

### Expected Output

**Note:** This is a complex task (7 features) and may approach API/token limits.

**Files:**
- Multiple Activity/ViewModel files
- Repository layer
- Data models
- Multiple Composables
- Navigation setup
- Resource files

**Features:**
- Browse recipe catalog
- View recipe instructions
- Search functionality
- Category filtering
- Favorite recipes
- Generate shopping list
- Cooking timer

## Fitness Tracker (Medium)

### Specification

```json
{
  "app_name": "FitnessTracker",
  "features": [
    "log_workout",
    "view_history",
    "statistics",
    "goal_setting",
    "progress_chart"
  ],
  "architecture": "MVVM",
  "ui_system": "Compose",
  "min_sdk": 24,
  "target_sdk": 34,
  "gradle_version": "8.2.0",
  "kotlin_version": "1.9.20"
}
```

### Expected Output

**Files:**
- Workout logging screen
- History view
- Statistics display
- Goal management
- Chart visualization
- Data persistence layer

**Features:**
- Log workout sessions
- View workout history
- Display statistics
- Set fitness goals
- Progress charts

## Best Practices

### Feature Count

- **Optimal:** 3-5 features
- **Acceptable:** 6-8 features
- **Risky:** 9-10 features (may hit limits)

### Feature Naming

**Good:**
- `"login"`
- `"list_items"`
- `"detail_view"`
- `"search"`

**Avoid:**
- `"complete user authentication flow with OAuth and biometric"`
- `"advanced search with filters, sorting, and pagination"`

### Architecture Choice

- **MVVM:** Most common, good for most apps
- **MVP:** Good for Views-based UI
- **MVI:** Good for complex state management

### UI System Choice

- **Compose:** Modern, recommended for new apps
- **Views:** Traditional, more verbose

### SDK Versions

- **min_sdk: 24** covers 95%+ of devices
- **target_sdk: 34** for latest features

### Gradle/Kotlin Versions

- **Gradle 8.2.0+** for latest features
- **Kotlin 1.9.20+** for latest language features

## Anti-Patterns

### Too Many Features

**Bad:**
```json
{
  "features": [
    "login", "signup", "profile", "settings", 
    "list", "detail", "search", "filter", 
    "favorites", "share", "notifications"
  ]
}
```

**Reason:** 11 features will likely hit token limit

**Solution:** Split into multiple tasks

### Vague Features

**Bad:**
```json
{
  "features": ["user management", "data handling"]
}
```

**Reason:** Too broad, unpredictable output

**Solution:** Be specific: `["login", "signup", "profile_edit"]`

### Mixing Concerns

**Bad:**
```json
{
  "features": ["ui_design", "backend_integration", "testing"]
}
```

**Reason:** System generates frontend only

**Solution:** Focus on app features: `["login_screen", "api_calls", "data_display"]`

### Outdated Versions

**Bad:**
```json
{
  "min_sdk": 19,
  "gradle_version": "7.0.0",
  "kotlin_version": "1.7.0"
}
```

**Reason:** Old versions, deprecated APIs

**Solution:** Use recent stable versions
