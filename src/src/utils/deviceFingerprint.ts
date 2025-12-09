/**
 * ===============================================================================
 * DEVICE FINGERPRINT UTILITY - DEVICE IDENTIFICATION AND SECURITY
 * ===============================================================================
 * 
 * This module provides device fingerprinting capabilities for trusted device
 * identification, security validation, and user experience optimization in the
 * CRM system. It generates unique device identifiers based on browser and
 * system characteristics.
 * 
 * FEATURES:
 * 
 * 1. DEVICE IDENTIFICATION
 *    - Unique device fingerprint generation
 *    - Browser and OS detection capabilities
 *    - Canvas fingerprinting for enhanced uniqueness
 *    - Hardware characteristics collection
 * 
 * 2. SECURITY IMPLEMENTATION
 *    - Trusted device management
 *    - Device comparison and validation
 *    - Trust level calculation based on device characteristics
 *    - IP and location tracking capabilities
 * 
 * 3. USER EXPERIENCE
 *    - Friendly device naming for display
 *    - Device characteristic analysis
 *    - Performance-optimized fingerprint generation
 * 
 * USAGE:
 * Import device fingerprint functions for security and trusted device
 * management throughout the CRM system.
 * ===============================================================================
 */

import { DeviceFingerprint } from '../types';

// ===============================================================================
// MAIN DEVICE FINGERPRINT GENERATION
// ===============================================================================

/**
 * ===============================================================================
 * GENERATE DEVICE FINGERPRINT
 * ===============================================================================
 * 
 * Generates a comprehensive device fingerprint by collecting browser,
 * system, and hardware characteristics for unique device identification.
 * Includes canvas fingerprinting, user agent parsing, and system information.
 * 
 * @returns DeviceFingerprint object with all collected device characteristics
 */
export function generateDeviceFingerprint(): DeviceFingerprint {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let canvasFingerprint = '';
  
  if (ctx) {
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    canvasFingerprint = canvas.toDataURL();
  }

  // Parse user agent for device info
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const language = navigator.language;
  
  // Detect browser
  const browser = detectBrowser(userAgent);
  
  // Detect OS
  const os = detectOS(userAgent, platform);
  
  // Screen info
  const screenResolution = `${screen.width}x${screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Generate unique device ID
  const deviceId = generateDeviceId({
    userAgent,
    platform,
    screenResolution,
    timezone,
    language,
    canvasFingerprint
  });

  return {
    deviceId,
    userAgent,
    platform,
    browser,
    os,
    screenResolution,
    timezone,
    language,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack === '1',
    canvasFingerprint
  };
}

/**
 * Generate a unique device ID based on device characteristics
 */
function generateDeviceId(deviceInfo: any): string {
  const combined = JSON.stringify(deviceInfo);
  
  // Simple hash function for device ID
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Detect browser from user agent
 */
function detectBrowser(userAgent: string): string {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  if (userAgent.includes('Opera')) return 'Opera';
  return 'Unknown';
}

/**
 * Detect operating system from user agent and platform
 */
function detectOS(userAgent: string, platform: string): string {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return platform || 'Unknown';
}

/**
 * Generate a friendly device name for display
 */
export function generateDeviceName(fingerprint: DeviceFingerprint): string {
  const { browser, os, platform } = fingerprint;
  
  // Create a readable device name
  let deviceName = `${browser} on ${os}`;
  
  // Add more specific info if available
  if (platform && platform !== os) {
    deviceName += ` (${platform})`;
  }
  
  // Add screen resolution for uniqueness
  deviceName += ` - ${fingerprint.screenResolution}`;
  
  return deviceName;
}

/**
 * Get client IP address (mock implementation - in real app, get from server)
 */
export async function getClientIP(): Promise<string> {
  try {
    // In a real implementation, you would call your backend API
    // For now, we'll use a mock IP detection service
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn('Could not fetch IP address:', error);
    // Fallback to a placeholder
    return 'unknown';
  }
}

/**
 * Get location info based on IP (mock implementation)
 */
export async function getLocationFromIP(ip: string): Promise<{ country?: string; city?: string }> {
  try {
    // In a real implementation, you would use a proper IP geolocation service
    // For now, return mock data
    return {
      country: 'Unknown',
      city: 'Unknown'
    };
  } catch (error) {
    console.warn('Could not fetch location:', error);
    return {};
  }
}

/**
 * Check if device fingerprint matches stored fingerprint
 */
export function compareDeviceFingerprints(
  current: DeviceFingerprint, 
  stored: DeviceFingerprint
): boolean {
  // Compare key identifying features
  const keyFeatures = [
    'userAgent',
    'platform', 
    'browser',
    'os',
    'screenResolution',
    'timezone'
  ];
  
  for (const feature of keyFeatures) {
    if (current[feature as keyof DeviceFingerprint] !== stored[feature as keyof DeviceFingerprint]) {
      return false;
    }
  }
  
  return true;
}

/**
 * Calculate trust level based on device characteristics
 */
export function calculateTrustLevel(fingerprint: DeviceFingerprint): 'high' | 'medium' | 'low' {
  let score = 0;
  
  // High trust indicators
  if (fingerprint.cookieEnabled) score += 2;
  if (fingerprint.browser === 'Chrome' || fingerprint.browser === 'Firefox') score += 2;
  if (fingerprint.os === 'Windows' || fingerprint.os === 'macOS') score += 2;
  if (fingerprint.screenResolution.includes('1920') || fingerprint.screenResolution.includes('1440')) score += 1;
  
  // Medium trust indicators
  if (fingerprint.browser === 'Safari' || fingerprint.browser === 'Edge') score += 1;
  if (fingerprint.os === 'Linux') score += 1;
  
  // Low trust indicators
  if (fingerprint.doNotTrack) score -= 1;
  if (fingerprint.browser === 'Unknown') score -= 2;
  
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}
