IPTV Brabant — Local dev

This is a small static site. The repository now contains:

- `index.html` — main page (markup)
- `css/styles.css` — extracted styles
- `js/app.js` — application script
- `package.json` — development scripts and devDependencies (not installed here)
- `AGENT_SESSIONS.md` — documentation about GitHub Copilot agent sessions

Quick local setup (PowerShell):

```powershell
# go to project
cd 'C:\Users\Admin\Documents\IPTV Brababant website'

# create package.json (if you didn't already)
npm init -y

# install dev tools (ESLint, Prettier, Jest)
npm install --save-dev eslint prettier jest

# run linters / formatters
npm run lint
npm run format
npm test
```

Notes:
- This environment couldn't run `npm` (it is not available here), so `package.json` has been created but `node_modules` are not installed. Run the commands above on your machine to install dev dependencies.
- ESLint can be initialized with `npx eslint --init` to create a config tailored to your style.
- You can change script commands in `package.json` to match any preferred setup.

## Additional Documentation

- [What is an Agent Session?](AGENT_SESSIONS.md) - Learn about GitHub Copilot agent sessions and how they work
# Trigger Hasura deploy workflow
# Trigger Hasura deploy workflow endpojnt/secret
