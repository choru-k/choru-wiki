#!/usr/bin/env node

/**
 * Quick Link Checker - Fast markdown link validation
 * Usage: node scripts/quick-link-check.js [file_or_directory]
 */

const fs = require('fs');
const path = require('path');

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

class LinkChecker {
    constructor(target = 'docs') {
        this.target = target;
        this.stats = {
            filesChecked: 0,
            totalLinks: 0,
            brokenLinks: 0,
            missingFiles: 0
        };
        this.issues = [];
    }

    log(level, message) {
        const timestamp = new Date().toISOString();
        const color = {
            'ERROR': colors.red,
            'WARN': colors.yellow,
            'INFO': colors.blue,
            'SUCCESS': colors.green
        }[level] || colors.reset;
        
        console.log(`${color}[${level}] ${message}${colors.reset}`);
    }

    extractLinks(content) {
        const links = [];
        
        // Match [text](link) format
        const inlineLinks = content.match(/\[([^\]]*)\]\(([^)]+)\)/g);
        if (inlineLinks) {
            inlineLinks.forEach(match => {
                const link = match.match(/\[([^\]]*)\]\(([^)]+)\)/)[2];
                links.push(link);
            });
        }
        
        // Match [text]: link format
        const refLinks = content.match(/^\[([^\]]*)\]: (.+)$/gm);
        if (refLinks) {
            refLinks.forEach(match => {
                const link = match.match(/^\[([^\]]*)\]: (.+)$/)[2];
                links.push(link);
            });
        }
        
        return links;
    }

    isValidLink(filePath, link) {
        // Skip empty links
        if (!link || link.trim() === '') return true;
        
        // Skip anchor-only links
        if (link.startsWith('#')) return true;
        
        // Skip external URLs
        if (link.match(/^https?:\/\/|^ftp:\/\/|^mailto:/)) return true;
        
        // Handle relative paths
        let targetPath;
        const fileDir = path.dirname(filePath);
        
        if (link.startsWith('/')) {
            // Absolute path from repo root
            targetPath = path.join(path.dirname(this.target), link);
        } else {
            // Relative path from current file
            targetPath = path.resolve(fileDir, link);
        }
        
        // Remove anchors
        targetPath = targetPath.split('#')[0];
        
        // Check if file exists
        if (fs.existsSync(targetPath)) {
            return true;
        }
        
        // Check if it's a directory with index.md
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
            return fs.existsSync(path.join(targetPath, 'index.md'));
        }
        
        return false;
    }

    checkFile(filePath) {
        this.stats.filesChecked++;
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const links = this.extractLinks(content);
            
            links.forEach(link => {
                this.stats.totalLinks++;
                
                if (!this.isValidLink(filePath, link)) {
                    this.stats.brokenLinks++;
                    this.issues.push({
                        type: 'broken_link',
                        file: filePath,
                        link: link
                    });
                }
            });
            
        } catch (error) {
            this.log('ERROR', `Failed to read file: ${filePath} - ${error.message}`);
        }
    }

    checkDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            this.log('ERROR', `Directory does not exist: ${dirPath}`);
            return;
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        entries.forEach(entry => {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                this.checkDirectory(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                this.checkFile(fullPath);
            }
        });
    }

    checkMissingFromIndex(chapterDir) {
        const indexPath = path.join(chapterDir, 'index.md');
        
        if (!fs.existsSync(indexPath)) return;
        
        try {
            const indexContent = fs.readFileSync(indexPath, 'utf8');
            const entries = fs.readdirSync(chapterDir, { withFileTypes: true });
            
            entries.forEach(entry => {
                if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
                    if (!indexContent.includes(entry.name)) {
                        this.stats.missingFiles++;
                        this.issues.push({
                            type: 'missing_from_index',
                            file: path.join(chapterDir, entry.name),
                            index: indexPath
                        });
                    }
                }
            });
            
        } catch (error) {
            this.log('ERROR', `Failed to check index: ${indexPath} - ${error.message}`);
        }
    }

    run() {
        console.log(`${colors.blue}==========================================`);
        console.log(`     Quick Link Checker`);
        console.log(`==========================================${colors.reset}`);
        console.log(`Target: ${this.target}`);
        console.log('');

        const startTime = Date.now();

        // Check if single file or directory
        if (fs.existsSync(this.target) && fs.statSync(this.target).isFile()) {
            if (this.target.endsWith('.md')) {
                this.checkFile(this.target);
            } else {
                this.log('ERROR', 'File must be a markdown file (.md)');
                process.exit(1);
            }
        } else {
            // Check directory
            this.checkDirectory(this.target);
            
            // Check for missing files in indices
            this.findIndexDirectories(this.target).forEach(indexDir => {
                this.checkMissingFromIndex(indexDir);
            });
        }

        const duration = Date.now() - startTime;

        // Report issues
        if (this.issues.length > 0) {
            console.log(`${colors.red}Found Issues:${colors.reset}`);
            this.issues.forEach(issue => {
                if (issue.type === 'broken_link') {
                    console.log(`${colors.red}✗ BROKEN LINK${colors.reset} in ${issue.file}`);
                    console.log(`  Link: ${colors.yellow}${issue.link}${colors.reset}`);
                } else if (issue.type === 'missing_from_index') {
                    console.log(`${colors.red}✗ NOT IN INDEX${colors.reset}: ${issue.file}`);
                }
            });
            console.log('');
        }

        // Print summary
        console.log(`${colors.blue}==========================================`);
        console.log(`            SUMMARY`);
        console.log(`==========================================${colors.reset}`);
        console.log(`Files checked: ${this.stats.filesChecked}`);
        console.log(`Total links: ${this.stats.totalLinks}`);
        console.log(`Broken links: ${this.stats.brokenLinks}`);
        console.log(`Missing from index: ${this.stats.missingFiles}`);
        console.log(`Duration: ${duration}ms`);

        if (this.stats.brokenLinks === 0 && this.stats.missingFiles === 0) {
            this.log('SUCCESS', '✅ All links are valid!');
            process.exit(0);
        } else {
            this.log('ERROR', '❌ Found issues that need attention');
            process.exit(1);
        }
    }

    findIndexDirectories(dirPath) {
        const indexDirs = [];
        
        const traverse = (currentPath) => {
            try {
                const entries = fs.readdirSync(currentPath, { withFileTypes: true });
                
                // Check if this directory has an index.md
                if (entries.some(entry => entry.name === 'index.md' && entry.isFile())) {
                    indexDirs.push(currentPath);
                }
                
                // Recurse into subdirectories
                entries.forEach(entry => {
                    if (entry.isDirectory()) {
                        traverse(path.join(currentPath, entry.name));
                    }
                });
            } catch (error) {
                // Ignore permission errors and continue
            }
        };
        
        traverse(dirPath);
        return indexDirs;
    }
}

// Main execution
const target = process.argv[2] || 'docs';
const checker = new LinkChecker(target);
checker.run();