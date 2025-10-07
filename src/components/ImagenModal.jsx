import { X } from "lucide-react";

const ImagenModal = ({ url, visible, onClose }) => {
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 px-4">
            <div className="relative max-w-3xl w-full bg-white rounded-xl shadow-lg overflow-hidden">
                {/* Cerrar */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 rounded-full bg-white p-1 shadow hover:bg-gray-100"
                    aria-label="Cerrar modal"
                >
                    <X size={20} />
                </button>

                {/* Imagen */}
                <div className="p-4 sm:p-6">
                    <img
                        src={url}
                        alt="Imagen ampliada"
                        className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain"
                    />
                </div>
            </div>
        </div>
    );
};

export default ImagenModal;
