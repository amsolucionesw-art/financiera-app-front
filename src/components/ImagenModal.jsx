// src/components/ImagenModal.jsx
import { useEffect, useRef, useState } from "react";
import { X, Download } from "lucide-react";

const ImagenModal = ({ url, visible, onClose }) => {
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(false);
    const closeBtnRef = useRef(null);
    const overlayRef = useRef(null);

    // Bloquear scroll del body y manejar tecla Esc
    useEffect(() => {
        if (!visible) return;

        // Focus inicial en botón cerrar
        closeBtnRef.current?.focus?.();

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKeyDown = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKeyDown);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [visible, onClose]);

    // Reset de estados cuando cambia la imagen / se abre
    useEffect(() => {
        if (visible) {
            setCargando(true);
            setError(false);
        }
    }, [visible, url]);

    if (!visible) return null;

    // Cerrar haciendo click en el fondo (no en el contenido)
    const handleOverlayMouseDown = (e) => {
        if (e.target === overlayRef.current) {
            onClose?.();
        }
    };

    const handleDescargar = () => {
        try {
            const a = document.createElement("a");
            a.href = url;
            a.download = url?.split("/").pop() || "imagen";
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch {
            // Silencioso: si el navegador no permite forzar descarga, al menos abre en nueva pestaña
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onMouseDown={handleOverlayMouseDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-imagen-titulo"
        >
            <div
                className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-lg"
                onMouseDown={(e) => e.stopPropagation()} // Evita cerrar si clic dentro
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6">
                    <h3 id="modal-imagen-titulo" className="text-sm font-semibold text-gray-800">
                        Documento / Imagen
                    </h3>
                    <div className="flex items-center gap-2">
                        {url && !error && (
                            <button
                                type="button"
                                onClick={handleDescargar}
                                className="rounded-md border border-gray-300 bg-white p-1.5 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                title="Descargar imagen"
                            >
                                <Download size={18} />
                            </button>
                        )}
                        <button
                            type="button"
                            ref={closeBtnRef}
                            onClick={onClose}
                            className="rounded-full bg-white p-1.5 text-gray-700 shadow hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Cerrar modal"
                            title="Cerrar"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Contenido */}
                <div className="max-h-[80vh] overflow-auto p-4 sm:p-6">
                    {error ? (
                        <div className="flex min-h-[200px] items-center justify-center rounded-lg bg-gray-50 text-center">
                            <p className="text-sm text-gray-600">
                                No se pudo cargar la imagen.{" "}
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 underline underline-offset-2"
                                >
                                    Abrir en nueva pestaña
                                </a>
                            </p>
                        </div>
                    ) : (
                        <>
                            {cargando && (
                                <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
                                    <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-gray-300" />
                                    Cargando imagen…
                                </div>
                            )}
                            <img
                                src={url}
                                alt="Imagen ampliada"
                                className="mx-auto w-auto max-h-[70vh] rounded-lg object-contain"
                                onLoad={() => setCargando(false)}
                                onError={() => {
                                    setCargando(false);
                                    setError(true);
                                }}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImagenModal;

