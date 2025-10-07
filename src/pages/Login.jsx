import { useState } from 'react';
import { login } from '../services/authService';
import { Eye, EyeOff } from 'lucide-react';
import Swal from 'sweetalert2';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPwd, setShowPwd] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const res = await login(username, password);
            const token = typeof res === 'string' ? res : res.token;
            if (!token) throw new Error('Token no recibido del servidor');

            if (res.usuario) {
                const nombreParaGuardar =
                    res.usuario.nombre_completo ?? res.usuario.nombre ?? res.usuario.username ?? '';
                if (nombreParaGuardar) {
                    localStorage.setItem('userName', nombreParaGuardar);
                }
            }

            localStorage.setItem('token', token);

            await Swal.fire({
                title: '¡Bienvenido!',
                text: 'Has iniciado sesión correctamente',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            window.location.href = '/';
        } catch (err) {
            Swal.fire({
                title: 'Error',
                text: err.message || 'Credenciales incorrectas',
                icon: 'error'
            });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-200 to-sky-400 dark:from-slate-800 dark:to-slate-900">
            <form
                onSubmit={handleSubmit}
                className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md"
            >
                {/* Logo centrado */}
                <div className="flex justify-center mb-6">
                    <img
                        src="/logosye.png"
                        alt="Logo"
                        className="h-50 bg-white p-1 rounded shadow"
                    />
                </div>

                <h2 className="text-3xl font-bold text-center mb-8 dark:text-white">
                    Iniciar Sesión
                </h2>

                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Usuario"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        autoFocus
                    />

                    <div className="relative">
                        <input
                            type={showPwd ? 'text' : 'password'}
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 pr-10"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPwd(!showPwd)}
                            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"
                        >
                            {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        className="w-full py-2 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold transition"
                    >
                        Entrar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Login;
