/**
 * ===============================================================================
 * APPLICATION ENTRY POINT - CRM SYSTEM MAIN BOOTSTRAP
 * ===============================================================================
 * 
 * This file serves as the main entry point for the CRM application.
 * It initializes the React application with strict mode enabled and renders
 * the root App component.
 * 
 * CONFIGURATION:
 * - Uses React 18's createRoot API for optimal performance
 * - Enables StrictMode for development warnings and checks
 * - Imports global CSS styles
 * - Assumes a DOM element with id 'root' exists
 * 
 * USAGE:
 * This file is typically referenced as the entry point in the bundler
 * configuration (e.g., Vite, Webpack) for building the application.
 * ===============================================================================
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Initialize and render the React application
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
