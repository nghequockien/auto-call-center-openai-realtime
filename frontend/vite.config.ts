import path from "path";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), basicSsl()],
    build: {
        outDir: "../backend/static",
        emptyOutDir: true,
        sourcemap: true
    },
    resolve: {
        preserveSymlinks: true,
        alias: {
            "@": path.resolve(__dirname, "./src")
        }
    },
    server: {
        proxy: {
            "/realtime": {
                //target: "ws://f9b322a8d01c.mylabserver.com:8080",
                target: "ws://localhost:8765",
                ws: true,
                rewriteWsOrigin: true
                // configure: (proxy, options) => {
                //     proxy.on("proxyReqWs", (proxyReq, req, socket, options, head) => {
                //         const token = "your_token_here";
                //         proxyReq.setHeader("Authorization", `Bearer ${token}`);
                //     });
                // }
            }
        }
    }
});
