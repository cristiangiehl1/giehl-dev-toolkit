# Publishing privately with Verdaccio

Distributing an internal MCP server the same way a public one is distributed — `npx @scope/pkg@latest` in `.vscode/mcp.json` or any MCP client config — without putting it on the public npm registry. Verdaccio is a self-hosted npm-compatible registry; teams point `npm`/`npx` at it instead of `registry.npmjs.org`.

This is orthogonal to which shape the server uses (`single-domain.md` or `modular-monolith.md`): publishing only cares about what `files` ships and whether the entry point is runnable once installed — it doesn't care how many modules are inside `src/`.

## Running the registry

```yaml
# docker-compose.yaml
services:
  verdaccio:
    image: verdaccio/verdaccio:6
    container_name: verdaccio
    ports:
      - "4873:4873"
```

This minimal form works for a local, throwaway registry (a training environment, a quick local test before a real publish) — but it has no volume, so every `docker compose down` silently erases every package and every user you registered. For anything meant to survive a container restart (a team's actual private registry), mount both the storage and the config:

```yaml
services:
  verdaccio:
    image: verdaccio/verdaccio:6
    container_name: verdaccio
    ports:
      - "4873:4873"
    volumes:
      - ./verdaccio/storage:/verdaccio/storage
      - ./verdaccio/conf:/verdaccio/conf
```

`./verdaccio/conf/config.yaml` is where auth (htpasswd, or an `auth` plugin), uplinks (whether Verdaccio falls through to the real npm registry for packages it doesn't have), and per-package access rules live — read Verdaccio's own docs for that file's schema when auth beyond "anyone who registers can publish" is needed.

```bash
npm run registry:start   # docker compose up -d
npm run registry:login:private   # npm login --registry http://localhost:4873
```

`npm login` against Verdaccio's default config creates the account on first use — there's no separate signup step.

## What `package.json` needs to actually be installable via `npx`

Four things, verified against a real course project's working config — get any one wrong and `npx @scope/pkg@latest` fails or does nothing useful:

```json
{
  "name": "@your-scope/customers-mcp",
  "bin": { "customers-mcp": "./src/index.ts" },
  "files": ["src"],
  "dependencies": {
    "tsx": "^4.21.0"
  }
}
```

- **Scoped name** (`@scope/pkg`) — lets a private package share a name with something that might exist on the public registry without colliding, and reads naturally in `npx @scope/pkg@latest`.
- **`files: ["src"]`** — npm packs `package.json` and `README.md` always; everything else needs to be in `files` or it's excluded from the tarball. Without this, `tests/`, `.github/`, `docker-compose.yaml` all ship too — harmless but bloats every install.
- **`bin` pointing straight at `./src/index.ts`, no build step** — works because Node (or `tsx`, see below) can execute TypeScript directly; there's no `dist/` and no `tsconfig` compile step in the publish pipeline. This only works because of the next point.
- **A shebang the entry file can actually run with, and the interpreter it names must be a runtime dependency, not a devDependency:**

```ts
#!/usr/bin/env tsx
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
```

  When `npx` (or a global install) runs the `bin` command, the OS executes the file directly via its shebang — it does **not** run your project's `npm start` script, so a flag like `node --experimental-strip-types` that you rely on locally never gets applied unless it's baked into the shebang itself. `#!/usr/bin/env -S node --experimental-strip-types` (the `-S` lets `env` split a multi-word command) is one way to do that, but `env -S` support is inconsistent across shells/OSes; `tsx` as the shebang interpreter sidesteps that portability question entirely, at the cost of one extra dependency.

  Because this interpreter is resolved **at the consumer's install time**, it must be a `dependency`, never a `devDependency` — a devDependency isn't installed when someone does `npm install @scope/pkg` or `npx @scope/pkg`, and the bin silently fails to execute.

- **The entry file must be executable in the published tarball** — npm preserves the file mode bit from your working tree, so if the source file isn't `chmod +x` before packing, the shebang exists but the OS refuses to run it. Bake this into the build step so it's never a manual, forgettable action:

```json
{ "scripts": { "build": "chmod 755 src/index.ts" } }
```

## The dual-registry release pattern

Mirror the private and public release paths as parallel scripts so testing "as if published" and actually going public are the same muscle memory, just a different `--registry`:

```json
{
  "scripts": {
    "registry:start": "docker compose up -d",
    "registry:stop": "docker compose down",
    "registry:login:private": "npm login --registry http://localhost:4873",
    "release:private": "npm version patch && npm publish --registry http://localhost:4873",
    "registry:login:public": "npm login --registry https://registry.npmjs.org/",
    "release:public": "npm version patch && npm publish --access public --registry https://registry.npmjs.org/"
  }
}
```

`--access public` only matters for the public registry call — a scoped package publishes as private there by default, and npmjs.org requires the explicit flag to make a scoped package public. Verdaccio doesn't have that restriction (it's already your own private registry), so the private script doesn't need it.

`npm version patch` before every publish is what lets the same version number never get re-published — npm (and Verdaccio) reject publishing over an existing version. Bump `minor`/`major` by hand for anything beyond a patch-level change.

## Consuming it: explicit `--registry` vs `.npmrc`

Two ways to point `npm`/`npx` at Verdaccio instead of the public registry, and they trade off differently:

- **Explicit flag, no persistent config:** `npx --registry http://localhost:4873 -y @scope/pkg@latest`. Nothing to set up or forget to unset, but every invocation (and every MCP client config referencing the package) needs to repeat it.
- **`.npmrc` scoped to the package's scope**, checked into the consuming project or set globally: `@scope:registry=http://localhost:4873`. Now a bare `npx @scope/pkg@latest` resolves correctly without repeating the registry everywhere — the trade-off is a machine-specific or repo-specific file that has to exist before the plain command works, and it's easy to forget it's there when debugging "why did this resolve from the wrong registry."

An MCP client config (`.vscode/mcp.json`) reflects whichever choice was made:

```jsonc
{
  "servers": {
    "customers-mcp": {
      "command": "npx",
      // explicit-flag form — works with no .npmrc anywhere:
      "args": ["-y", "--registry", "http://localhost:4873", "@scope/customers-mcp@latest"]
      // .npmrc form — same args work once the scope is mapped in .npmrc:
      // "args": ["-y", "@scope/customers-mcp@latest"]
    }
  }
}
```

## Trap: secrets pasted directly into the MCP client config

`.vscode/mcp.json`'s `env` block is a real, easy-to-miss way to leak a credential: a `SERVICE_TOKEN` (or any API key) typed there as a literal string ends up committed the moment that file is tracked by git, because nothing about `.vscode/` signals "this one holds a secret" the way `.env` does. Verified in practice, not hypothetical — this exact file, this exact field, is where it happens.

Fix: either keep `.vscode/mcp.json` out of git and provide `.vscode/mcp.json.example` with a placeholder, or use the client's own secret-prompt mechanism where one exists (e.g. VS Code's `${input:...}` variables) so the value never sits in a file that gets committed by habit.
