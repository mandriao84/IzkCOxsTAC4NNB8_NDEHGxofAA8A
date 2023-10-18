const { devices } = require('@playwright/test')
const dotenv = require('dotenv')
// const dotenv_result = dotenv.config({ path: `./${process.env.NVRNMT}.env`, override: true })
const dotenv_result = dotenv.config({ path: `./playwright.env`, override: true })



const config = {
  testDir: './tests',
  timeout: 180 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  trace: process.env.CI === 1 ? "on" : "off",
  forbidOnly: process.env.CI === 1 ? true : false,
  retries: 0,
  workers: undefined,
  reporter: 'html',
  use: {
    bypassCSP: true,
    actionTimeout: 0,
    navigationTimeout: 0,
    baseURL: process.env.URL === undefined ? "https://staging.inqom.com" : process.env.URL,
    // storageState: "./.datasets/storageState.json",
    video: 'on-first-retry',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  outputDir: 'test-results/',


  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },

    {
      name: 'azure',
      testDir: './.azure',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    {
      name: 'datasets',
      testDir: './.datasets',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    
    {
      name: 'gh_pw_tests',
      testDir: './.github/pw_tests',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    {
      name: 'gh_slack_endpoints',
      testDir: './.github/slack_endpoints',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    {
      name: 'gh_slack_reports',
      testDir: './.github/slack_reports',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    {
      name: 'gh_gh_workflows-purge',
      testDir: './.github/gh_workflows-purge',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
}

module.exports = config;
