/**
 * Project Registry
 *
 * Manages project discovery and lookup
 *
 * Two modes:
 * 1. Auto-discovery: Scan PROJECT_ROOT_PATH for directories
 * 2. Explicit list: Parse PROJECT_PATHS from .env
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';
import { Logger } from './logger.js';

export class ProjectRegistry {
  /**
   * Create ProjectRegistry instance
   * @param {Object} options
   * @param {string} options.rootPath - Root path for auto-discovery
   * @param {string} options.projectPaths - Comma-separated project paths from env
   */
  constructor(options = {}) {
    this.rootPath = resolve(options.rootPath || process.cwd());
    this.projectPaths = options.projectPaths || process.env.PROJECT_PATHS;
    this.logger = new Logger('ProjectRegistry');

    this.projects = [];
    this.projectMap = new Map(); // name -> project

    this.initialize();
  }

  /**
   * Initialize project registry
   * @private
   */
  initialize() {
    try {
      // Mode 1: Explicit paths from env
      if (this.projectPaths && this.projectPaths.trim() !== '') {
        this.logger.info('Loading projects from PROJECT_PATHS');
        this.loadExplicitProjects();
      } else {
        // Mode 2: Auto-discovery
        this.logger.info(`Auto-discovering projects in ${this.rootPath}`);
        this.discoverProjects();
      }

      this.logger.info(`Loaded ${this.projects.length} project(s)`);
    } catch (error) {
      this.logger.error('Failed to initialize project registry:', error.message);
      this.projects = [];
    }
  }

  /**
   * Load projects from explicit paths
   * @private
   */
  loadExplicitProjects() {
    const paths = this.projectPaths
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);

    for (const path of paths) {
      try {
        const absolutePath = resolve(path);

        if (!existsSync(absolutePath)) {
          this.logger.warn(`Project path does not exist: ${path}`);
          continue;
        }

        const stats = statSync(absolutePath);

        if (!stats.isDirectory()) {
          this.logger.warn(`Project path is not a directory: ${path}`);
          continue;
        }

        const name = basename(absolutePath);
        const project = { name, path: absolutePath };

        this.projects.push(project);
        this.projectMap.set(name.toLowerCase(), project);

      } catch (error) {
        this.logger.warn(`Failed to load project ${path}:`, error.message);
      }
    }
  }

  /**
   * Discover projects in root path
   * @private
   */
  discoverProjects() {
    try {
      if (!existsSync(this.rootPath)) {
        this.logger.warn(`Root path does not exist: ${this.rootPath}`);
        return;
      }

      const entries = readdirSync(this.rootPath);

      for (const entry of entries) {
        // Skip hidden directories
        if (entry.startsWith('.')) {
          continue;
        }

        const fullPath = join(this.rootPath, entry);

        try {
          const stats = statSync(fullPath);

          if (stats.isDirectory()) {
            const project = {
              name: entry,
              path: fullPath
            };

            this.projects.push(project);
            this.projectMap.set(entry.toLowerCase(), project);
          }
        } catch (err) {
          // Skip entries that can't be stat'd
          continue;
        }
      }
    } catch (error) {
      throw new Error(`Failed to read project root: ${error.message}`);
    }
  }

  /**
   * Get all projects
   * @returns {Array<{name: string, path: string}>}
   */
  getAllProjects() {
    return [...this.projects];
  }

  /**
   * Get project by name (case-insensitive)
   * @param {string} name
   * @returns {Object|null}
   */
  getProjectByName(name) {
    return this.projectMap.get(name.toLowerCase()) || null;
  }

  /**
   * Check if project exists
   * @param {string} name
   * @returns {boolean}
   */
  hasProject(name) {
    return this.projectMap.has(name.toLowerCase());
  }

  /**
   * Reload projects (useful for hot-reload)
   */
  reload() {
    this.projects = [];
    this.projectMap.clear();
    this.initialize();
  }

  /**
   * Get project count
   * @returns {number}
   */
  getProjectCount() {
    return this.projects.length;
  }
}

export default ProjectRegistry;
