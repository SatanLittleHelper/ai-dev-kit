# Resolvers: Navigation, Not Data Loading

A route resolver controls navigation. It is not a general way to load data for a page.

- Use a resolver only when the result of the request decides whether the navigation may happen (access, existence of the entity the URL points to, redirect). A failed or empty result then cancels or redirects the navigation.
- When the result decides **what the page renders** (dictionaries, lists, form data), the page or its store loads it: a container component with `resource()`/`rxResource()` under the project's resource-state component, or a root service with a cache. Loading and error states appear in the page, with a retry, instead of an empty screen after a cancelled navigation.
- Static reference data (dictionaries) goes through one cached service (see the project's dictionaries service), not through per-route resolvers.
- Guards answer "may the user enter"; resolvers answer "should the navigation happen for this URL"; neither is a place to preload display data.

## Common Mistakes

| Mistake | Fix |
|---|---|
| A resolver that only loads data the page then displays | Load it in the page container with `resource()`, show loading and error there |
| A failed resolver leaving a blank page with a toast | Move the request into the page: error state with a retry button |
| Dictionaries fetched in a resolver on every route entry | Cached dictionaries service, one request per name per TTL |
