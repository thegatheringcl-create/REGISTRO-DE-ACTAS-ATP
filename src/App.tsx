import React, { useState, useEffect, createContext, useRef, Component } from 'react';
import { auth, googleProvider, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { LayoutDashboard, PlusCircle, LogOut, Users, ChevronUp, Settings, XCircle } from 'lucide-react';
import NewVisitForm from './components/NewVisitForm';
import Dashboard from './components/Dashboard';
import AdminPanel from './components/AdminPanel';

export type UserProfile = {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'asesor' | '';
  asesorName?: string;
  isSetupComplete?: boolean;
};

export const UserContext = createContext<{ userProfile: UserProfile | null }>({ userProfile: null });

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;
  
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
    this.props = props;
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Algo salió mal</h1>
          <p className="text-gray-600 mb-8">La aplicación ha experimentado un error inesperado al procesar los datos.</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors"
          >
            Recargar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState<'new' | 'dashboard' | 'admin'>('new');
  const [visitaToEdit, setVisitaToEdit] = useState<any>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.exists()) {
            const isFirstAdmin = currentUser.email === 'thegathering.cl@gmail.com';
            
            if (isFirstAdmin) {
              const newProfile: Omit<UserProfile, 'uid'> = {
                email: currentUser.email || '',
                displayName: currentUser.displayName || '',
                role: 'admin',
                asesorName: '',
                isSetupComplete: true
              };
              await setDoc(userRef, newProfile);
              setUser(currentUser);
              setUserProfile({ uid: currentUser.uid, ...newProfile });
            } else {
              // Check if user is pre-registered in allowed_users
              const allowedRef = doc(db, 'allowed_users', currentUser.email?.toLowerCase() || '');
              const allowedSnap = await getDoc(allowedRef);
              
              if (allowedSnap.exists()) {
                const allowedData = allowedSnap.data();
                const newProfile: Omit<UserProfile, 'uid'> = {
                  email: currentUser.email || '',
                  displayName: currentUser.displayName || '',
                  role: allowedData.role,
                  asesorName: allowedData.asesorName || '',
                  isSetupComplete: true
                };
                await setDoc(userRef, newProfile);
                setUser(currentUser);
                setUserProfile({ uid: currentUser.uid, ...newProfile });
              } else {
                // Access Denied
                await signOut(auth);
                setUser(null);
                setUserProfile(null);
                setAccessDenied(true);
                setIsAuthReady(true);
                return;
              }
            }
          } else {
            const data = userSnap.data();
            if (data.isSetupComplete === undefined) {
              data.isSetupComplete = true; // Legacy users
            }
            setUser(currentUser);
            setUserProfile({ uid: currentUser.uid, ...data } as UserProfile);
          }
        } catch (error: any) {
          console.error("Error fetching user profile:", error);
          if (error.message?.includes('offline') || error.code === 'unavailable') {
            console.warn("El cliente está sin conexión o la base de datos no está disponible. Reintentando en segundo plano...");
            const isFirstAdmin = currentUser.email === 'thegathering.cl@gmail.com';
            setUser(currentUser);
            setUserProfile({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              role: isFirstAdmin ? 'admin' : '',
              asesorName: '',
              isSetupComplete: isFirstAdmin
            });
          }
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAccessDenied(false);
    try {
      console.log("Iniciando sesión con popup...");
      const result = await signInWithPopup(auth, googleProvider);
      console.log("Resultado de inicio de sesión:", result.user.email);
    } catch (error: any) {
      console.error("Error completo de inicio de sesión:", error);
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        console.log("El usuario canceló el inicio de sesión o se cerró la ventana.");
      } else if (error.code === 'auth/popup-blocked') {
        alert("El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes (popups) para este sitio en la configuración de tu navegador.");
      } else if (error.code === 'auth/unauthorized-domain') {
        alert("Este dominio no está autorizado en la consola de Firebase. Por favor, contacta al administrador.");
      } else if (error.message?.includes('INTERNAL ASSERTION FAILED')) {
        console.warn("Error interno de Firebase detectado. Intentando limpiar estado...");
        // No alertar al usuario por este error técnico si es posible reintentar
      } else {
        alert(`Error al iniciar sesión (${error.code}): ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsProfileMenuOpen(false);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Cargando...</p></div>;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Acceso Denegado</h1>
          <p className="text-gray-600 mb-8">Tu correo no está registrado en el sistema. Por favor, contacta al administrador para que te dé acceso.</p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoggingIn ? 'Cargando...' : 'Intentar con otra cuenta'}
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center">
          <div className="mb-6 flex justify-center">
            <img 
              src="https://www.corpomelipilla.cl/wp-content/uploads/2021/03/logo-cormumel-educacion.png" 
              alt="Logo Corporación Municipal de Melipilla" 
              className="h-40 w-auto object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = "https://www.gstatic.com/images/branding/product/2x/avatar_anonymous_white_120dp.png";
                target.className = "h-20 w-20 bg-blue-600 rounded-xl p-4";
              }}
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Corporación Municipal de Melipilla</h1>
          <h2 className="text-lg font-medium text-gray-600 mb-6">Sistema de Acompañamiento Técnico</h2>
          <p className="text-gray-500 mb-8">Inicia sesión para registrar y visualizar las visitas a establecimientos.</p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isLoggingIn ? (
              <span>Cargando...</span>
            ) : (
              <>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 bg-white rounded-full p-0.5" />
                <span>Iniciar sesión con Google</span>
              </>
            )}
          </button>
        </div>
        <footer className="mt-8 text-gray-400 text-xs text-center">
          <p>Elaborado por: claudio.jerez.santis@cormumel.cl</p>
        </footer>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <UserContext.Provider value={{ userProfile }}>
        <div className="min-h-screen bg-gray-50 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-200 flex items-center space-x-3">
            <img 
              src="https://www.corpomelipilla.cl/wp-content/uploads/2021/03/logo-cormumel-educacion.png" 
              alt="Logo Corporación Municipal de Melipilla" 
              className="h-12 w-auto object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = "https://www.gstatic.com/images/branding/product/2x/avatar_anonymous_white_120dp.png";
                target.className = "h-8 w-8 bg-blue-600 rounded-lg p-1";
              }}
            />
            <h1 className="text-xs font-bold text-gray-900 leading-tight">Corporación<br/>Municipal</h1>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <button
              onClick={() => setCurrentView('new')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                currentView === 'new' 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <PlusCircle className="w-5 h-5" />
              <span>Nueva Visita</span>
            </button>
            
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                currentView === 'dashboard' 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Resumen General</span>
            </button>

            {userProfile?.role === 'admin' && (
              <button
                onClick={() => setCurrentView('admin')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentView === 'admin' 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Users className="w-5 h-5" />
                <span>Administración</span>
              </button>
            )}
          </nav>

          <div className="p-4 border-t border-gray-200 relative" ref={menuRef}>
            <button 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3 overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                    {user.email?.[0].toUpperCase()}
                  </div>
                )}
                <div className="text-left truncate">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.displayName || 'Usuario'}</p>
                  <p className="text-xs text-gray-500 truncate">{userProfile?.role === 'admin' ? 'Administrador' : (userProfile?.asesorName || 'Asesor')}</p>
                </div>
              </div>
              <ChevronUp className={`w-5 h-5 text-gray-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Conectado como</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto flex flex-col">
          <div className="p-8 max-w-5xl mx-auto flex-1 w-full">
            {currentView === 'new' && (
              <NewVisitForm 
                visitaToEdit={visitaToEdit} 
                onCancelEdit={() => {
                  setVisitaToEdit(null);
                  setCurrentView('dashboard');
                }} 
              />
            )}
            {currentView === 'dashboard' && (
              <Dashboard 
                onEditVisita={(visita) => {
                  setVisitaToEdit(visita);
                  setCurrentView('new');
                }} 
              />
            )}
            {currentView === 'admin' && userProfile?.role === 'admin' && <AdminPanel />}
          </div>
          <footer className="p-4 text-center text-gray-400 text-xs border-t border-gray-100 bg-white">
            <p>Elaborado por: claudio.jerez.santis@cormumel.cl</p>
          </footer>
        </main>
      </div>
    </UserContext.Provider>
    </ErrorBoundary>
  );
}
