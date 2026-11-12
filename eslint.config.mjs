import prettierConfig from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
            "no-console": "warn",
            "prefer-const": "error",
            "no-var": "error",
            eqeqeq: ["error", "always"],
            curly: ["error", "all"],
            "no-implicit-coercion": "error",
            "no-shadow": "error",
        },
    },
    {
        files: ["apps/**/*.{ts,tsx}"],
        extends: [...tseslint.configs.recommendedTypeChecked],
        plugins: { "react-hooks": reactHooks },
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        "apps/*/vite.config.ts",
                        "apps/*/api/*.ts",
                    ],
                    maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
                },
            },
        },
        rules: {
            // Progressive: all type-safety rules start as warnings.
            // Upgrade to "error" one-by-one as you fix each category.
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unsafe-assignment": "warn",
            "@typescript-eslint/no-unsafe-member-access": "warn",
            "@typescript-eslint/no-unsafe-call": "warn",
            "@typescript-eslint/no-unsafe-argument": "warn",
            "@typescript-eslint/no-unsafe-return": "warn",
            "@typescript-eslint/no-floating-promises": "warn",
            "@typescript-eslint/no-misused-promises": "warn",
            "@typescript-eslint/no-unnecessary-type-assertion": "warn",
            "@typescript-eslint/no-base-to-string": "warn",
            "@typescript-eslint/only-throw-error": "warn",

            // Disable base rules that have TS equivalents
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
            "no-shadow": "off",
            "@typescript-eslint/no-shadow": "warn",

            // Progressive: these were not enforced in TS files before
            eqeqeq: "warn",

            // Suppress missing plugin errors from Next.js eslint-config
            "react-hooks/exhaustive-deps": "off",
        },
    },
    prettierConfig,
    globalIgnores(["**/dist/**", "**/dist-ssr/**", "**/build/**", "**/node_modules/**", "**/.next/**"]),
]);

export default eslintConfig;
