/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        useESM: false,
      },
    ],
  },
  moduleNameMapper: {
    "^@/generated/prisma/client$": "<rootDir>/lib/shims/generated-prisma-client.ts",
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/coverage/"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  transformIgnorePatterns: [
    "node_modules/(?!(viem|@noble|@scure)/)",
  ],

  // ── Coverage ──
  collectCoverageFrom: [
    "app/api/**/*.ts",
    "lib/**/*.ts",
    "!lib/shims/**",
    "!**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov"],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
};
