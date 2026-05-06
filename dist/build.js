"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
try {
    // Remove dist folder
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
        fs.rmSync(distPath, { recursive: true, force: true });
        console.log("✓ Removed dist folder");
    }
    // Run tsc
    console.log("Running tsc...");
    execSync("tsc", { stdio: "inherit" });
    console.log("✓ TypeScript compiled");
    // Copy assets
    console.log("Copying assets...");
    execSync("npm run copy-assets", { stdio: "inherit" });
    console.log("✓ Assets copied");
    // Remove "" from all .js files in dist
    console.log('Removing "" from dist files...');
    const distDir = path.join(__dirname, "dist");
    if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir).filter((f) => f.endsWith(".js"));
        let filesModified = 0;
        for (const file of files) {
            const filePath = path.join(distDir, file);
            let content = fs.readFileSync(filePath, "utf-8");
            const originalLength = content.length;
            content = content.replace(/export\s*\{\s*\}/g, "");
            if (content.length !== originalLength) {
                fs.writeFileSync(filePath, content, "utf-8");
                filesModified++;
            }
        }
        if (filesModified > 0) {
            console.log(`✓ Updated ${filesModified} file(s)`);
        }
        else {
            console.log('✓ No "" found');
        }
    }
    console.log("✓ Build complete!");
}
catch (error) {
    console.error("❌ Build failed:", error.message);
    process.exit(1);
}
//# sourceMappingURL=build.js.map