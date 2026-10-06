import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        "ignores": ["build/out/**/*"],
        "plugins": {
            "@stylistic": stylistic,
        },
        "rules": {
            "@stylistic/quotes": ["error", "backtick"],
            "@stylistic/quote-props": ["error", "as-needed"],
            "@stylistic/indent": ["error", 4, {"SwitchCase": 0}],
            "@typescript-eslint/no-unused-vars": ["warn",
            {
                "args": "all",
                "argsIgnorePattern": "^_",
                "caughtErrors": "all",
                "caughtErrorsIgnorePattern": "^_",
                "destructuredArrayIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "ignoreRestSiblings": true
            }],
            "@typescript-eslint/no-explicit-any": "off",
        }
    }
);
