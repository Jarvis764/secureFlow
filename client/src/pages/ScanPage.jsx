import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FileDropzone from '../components/FileDropzone';
import GitHubUrlInput from '../components/GitHubUrlInput';
import ScanProgress from '../components/ScanProgress';
import { uploadScan, scanGitHub } from '../services/api';

const PAGE_STYLE = {
  minHeight: 'calc(100vh - 64px)',
  marginTop: '64px',
  padding: '2rem',
  maxWidth: '1100px',
  margin: '64px auto 0',
};

const SCAN_STEPS = ['parsing', 'scanning', 'scoring', 'complete'];

export default function ScanPage() {
  const navigate = useNavigate();

  const [scanning,      setScanning]     = useState(false);
  const [progressStep,  setProgressStep] = useState('');
  const [toast,         setToast]        = useState(null); // { message, type: 'error'|'info' }

  function showToast(message, type = 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  /** Simulate pipeline progress steps while waiting for the real API call. */
  function startProgressAnimation() {
    let i = 0;
    setProgressStep(SCAN_STEPS[0]);
    const interval = setInterval(() => {
      i += 1;
      if (i < SCAN_STEPS.length - 1) {
        setProgressStep(SCAN_STEPS[i]);
      } else {
        clearInterval(interval);
      }
    }, 1400);
    return interval;
  }

  async function handleFileUpload(packageJsonFile, lockfileFile) {
    setScanning(true);
    const interval = startProgressAnimation();
    try {
      const res = await uploadScan(packageJsonFile, lockfileFile);
      clearInterval(interval);
      setProgressStep('complete');
      await new Promise((r) => setTimeout(r, 500));
      navigate(`/scan/${res.data.scanId}`);
    } catch (err) {
      clearInterval(interval);
      setProgressStep('');
      const msg = err?.response?.data?.error || 'Upload failed. Please try again.';
      showToast(msg);
    } finally {
      setScanning(false);
    }
  }

  async function handleGitHubScan(repoUrl) {
    setScanning(true);
    const interval = startProgressAnimation();
    try {
      const res = await scanGitHub(repoUrl);
      clearInterval(interval);
      setProgressStep('complete');
      await new Promise((r) => setTimeout(r, 500));
      navigate(`/scan/${res.data.scanId}`);
    } catch (err) {
      clearInterval(interval);
      setProgressStep('');
      const msg = err?.response?.data?.error || 'GitHub scan failed. Check the URL and try again.';
      showToast(msg);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div style={PAGE_STYLE}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ marginBottom: '2rem' }}
      >
        <h1 style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 700 }}>
          New Security Scan
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem', fontSize: '0.9rem' }}>
          Scan your project's dependencies for known vulnerabilities.
        </p>
      </motion.div>

      {/* Progress (shown while scanning) */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            key="progress"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card"
            style={{ marginBottom: '1.5rem' }}
          >
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
              Scanning in progress...
            </h3>
            <ScanProgress status={progressStep} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column scan methods */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* File upload */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              📁 File Upload
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Drop your <code style={{ color: 'var(--accent-cyan)' }}>package.json</code> and <code style={{ color: 'var(--accent-cyan)' }}>package-lock.json</code>.
            </p>
          </div>
          <FileDropzone onUpload={handleFileUpload} isLoading={scanning} />
        </div>

        {/* Divider */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 0',
          gap: '0.5rem',
          alignSelf: 'stretch',
        }}>
          <div style={{ flex: 1, width: '1px', background: 'var(--border-color)' }} />
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            background: 'var(--bg-primary)',
            padding: '0.4rem',
            borderRadius: '50%',
            border: '1px solid var(--border-color)',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            OR
          </span>
          <div style={{ flex: 1, width: '1px', background: 'var(--border-color)' }} />
        </div>

        {/* GitHub URL */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              🐙 GitHub Repository
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Paste the URL of a public GitHub repository to scan.
            </p>
          </div>
          <GitHubUrlInput onSubmit={handleGitHubScan} isLoading={scanning} />
        </div>
      </motion.div>

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            style={{
              position: 'fixed',
              bottom: '2rem',
              right: '2rem',
              background: toast.type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(0,240,255,0.10)',
              border: `1px solid ${toast.type === 'error' ? 'var(--severity-critical)' : 'var(--accent-cyan)'}`,
              borderRadius: '10px',
              padding: '0.85rem 1.25rem',
              color: toast.type === 'error' ? 'var(--severity-critical)' : 'var(--accent-cyan)',
              fontWeight: 600,
              fontSize: '0.88rem',
              maxWidth: '360px',
              backdropFilter: 'blur(8px)',
              zIndex: 200,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            {toast.type === 'error' ? '⚠️ ' : 'ℹ️ '}{toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
