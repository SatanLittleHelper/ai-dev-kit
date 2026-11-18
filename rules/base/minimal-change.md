# Minimal Change
Applies to implementation, bug fixes, refactors, and dependency choices; design stays with brainstorming. Before writing, read the code the change touches and list every place it must reach (callers, tests, fixtures, config, exports) and what it could break for users. That is scope; extra features are not.

Take the first option that fully works:

1. Does it need to exist? Skip options, flexibility, and features nobody asked for; name them in one line.
2. Already in this codebase (helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or platform feature? Use it, unless the project has its own component.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise, the minimum code that works.

- No abstraction, wrapper, option, config, or "for later" code nobody asked for; keep the codebase's structure.
- Bug fix: grep every caller of the function you touch, then fix the root cause once in the shared code.
- Moved or merged code keeps its error handling and validation. Of equal-size options, take the one correct on edge cases.
- A shortcut with a known limit gets a one-line comment: `// TODO: <the limit>, <when to upgrade>`.
- Tests follow `rules/base/testing.md`; this file neither adds nor removes them.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the user asked for.
<!-- Adapted from https://github.com/DietrichGebert/ponytail (MIT, DietrichGebert) -->
