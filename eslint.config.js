// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Código dos nós Code do n8n: o n8n o executa como corpo de função (com "return" no topo).
    ignores: ["dist/*", "integracoes/n8n/codigo/nos/**"],
  }
]);
