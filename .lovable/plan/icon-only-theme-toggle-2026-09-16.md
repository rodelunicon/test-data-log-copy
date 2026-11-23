# Icon-only theme toggle

## What will change
- Replace the current sun/moon plus text button with a compact icon-only control.
- Show the sun in dark mode and the moon in light mode so the icon indicates the available action.
- Use a subtle industrial-style border, amber active accent, and a short icon transition that matches the existing navigation.
- Keep the current dark/light switching and saved preference unchanged.
- Preserve a clear accessibility label and hover tooltip despite removing visible text.
- Check the control in both themes and at desktop and mobile navigation widths.

## Technical details
- Update only the theme toggle presentation in `src/components/theme-toggle.tsx`.
- Reuse the existing semantic theme colors and Lucide icons; no new packages or data changes.
