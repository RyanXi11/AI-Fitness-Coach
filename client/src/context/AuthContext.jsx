// src/context/AuthContext.jsx
import { createContext, useState, useContext } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialize from localStorage so a page refresh doesn't log you out —
  // this is the localStorage tradeoff we just discussed, made concrete.
  const [token, setToken] = useState(localStorage.getItem('token'));

  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

// A small custom hook so components can just call useAuth()
// instead of importing useContext(AuthContext) everywhere
export function useAuth() {
  return useContext(AuthContext);
}