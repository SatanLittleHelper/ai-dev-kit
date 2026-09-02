# Typography & Design-Scale Porting

When porting text/spacing px values from a design tool into utility classes, pick the nearest class on the framework's standard scale — don't apply a scaling adjustment, and don't use arbitrary bracket/one-off values (`text-[Npx]`, `pt-[Npx]`) for font size or spacing. This only holds when the app's root font-size is the framework's unscaled default (verify — an app that *does* override root font-size needs the opposite: an explicit scaling adjustment when porting).
