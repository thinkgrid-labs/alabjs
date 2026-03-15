<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #layout-top>
      <div class="alab-dev-banner">
        ⚠️ <strong>AlabJS is under active development and not yet production-ready.</strong>
        APIs may change before v1.0. Feel free to explore, contribute, or
        <a href="https://github.com/thinkgrid-labs/alabjs" target="_blank" rel="noopener">star the repo</a>.
      </div>
    </template>
  </Layout>
</template>
