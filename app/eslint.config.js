import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        "ignores": ["build/out/**/*"],
        "rules": {
            "quotes": ["error", "backtick"],
            "quote-props": ["error", "as-needed"],
            "indent": ["error", 4],
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