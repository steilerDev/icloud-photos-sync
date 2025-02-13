import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        ignores: ["build/out/**/*"],
        "rules": {
            "quotes": ["error", "backtick"],
            "quote-props": ["error", "as-needed"],
            "indent": ["error", 4],
            "eol-last": ["error", "never"],
            "new-cap": ["error", { "newIsCapExceptions": ["iCloud", "iCloudCrypto", "iCloudPhotos", "iCPSError", "default", "iCPSInfluxLineProtocolPoint"], "capIsNewExceptions": ["TTL", "BASE"] }],
            "no-negated-condition": "off",
            "no-unused-vars": "off",
            "no-undef": "off",
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
            "guard-for-in":  "off",
            "no-await-in-loop": "off",
            "max-params": "off",
            "no-return-assign": ["error", "except-parens"],
            "no-unreachable": "warn",
            "default-case-last": "off",
            "no-debugger": "warn",
            "no-promise-executor-return": "off",
            "no-unsafe-finally": "off",
            "tsdoc-undefined-tag": "off",
            "no-fallthrough": "off",
            "accessor-pairs": ["error", { "getWithoutSet": true, "enforceForClassMembers": false }],
            "@typescript-eslint/no-explicit-any": "off",
        }
    // }, {
    //     "files": ["*.test.ts"],
    //     "rules": {
    //         "max-nested-callbacks": "off"
    //     }
    }
);