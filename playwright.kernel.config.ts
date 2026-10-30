import { defineConfig } from '@playwright/test'
import base from './playwright.config.js'

// Separate workers without relying on words in test titles. Both groups are disjoint.
export default defineConfig({ ...base, testIgnore: [], testMatch: '**/kernel-session.spec.ts' })
