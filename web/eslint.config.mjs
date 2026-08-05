import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react-hooks v7 (bundled with eslint-config-next 16) adds
    // React Compiler *readiness* rules as errors by default — react-hooks/refs,
    // react-hooks/set-state-in-effect, react-hooks/purity. This project does not
    // enable the React Compiler (no `experimental.reactCompiler` / babel plugin
    // in next.config.ts), so these are style preferences for a future optimizing
    // compiler, not runtime correctness issues. They conflict with two ordinary,
    // correct patterns used throughout the dashboard port:
    //  - a small useDialog() hook wrapping a ref + open()/close() for native
    //    <dialog> elements (flagged as "accessing ref during render" purely
    //    because the ref flows through a custom hook's return value, even
    //    though it's only ever read inside event handlers);
    //  - useEffect synchronizing with external systems (localStorage, the URL
    //    hash, a network fetch) via setState, which is the documented, valid
    //    use of useEffect.
    // Disabled rather than restructured, since "fixing" them would mean either
    // duplicating ref/handler boilerplate at every one of the 10+ modals or
    // abandoning effects for their documented purpose — a worse tradeoff than
    // opting out of compiler-readiness linting the project doesn't use.
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static assets, not authored source — demo-mode.js in particular is
    // preserved byte-for-byte from public/js/demo-mode.js and must not be
    // touched, linted, or reformatted.
    "public/**",
  ]),
]);

export default eslintConfig;
