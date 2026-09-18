import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { LoginPage } from './components/LoginPage.tsx';
import { AdminPortal } from './components/AdminPortal.tsx';
import { ProtectedErpApp } from './components/ProtectedErpApp.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin/*" element={<AdminPortal />} />
        <Route path="/*" element={<ProtectedErpApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
