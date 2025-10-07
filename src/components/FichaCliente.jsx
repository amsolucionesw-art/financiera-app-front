// En la página FichaCliente.jsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { obtenerCreditosPorCliente } from '../services/creditoService';
import InfoCreditos from '../components/InfoCreditos';

const FichaCliente = ({ clienteId }) => {
    const queryClient = useQueryClient();

    const {
        data: creditos = [],
        isLoading,
        error,
        refetch,
    } = useQuery(['creditosCliente', clienteId], () =>
        obtenerCreditosPorCliente(clienteId),
    );

    if (isLoading) return <p>Cargando…</p>;
    if (error) return <p>Error: {error.message}</p>;

    return (
        <InfoCreditos
            creditos={creditos}
            refetchCreditos={() => {
                // invalidar para mantener consistencia global
                queryClient.invalidateQueries(['creditosCliente', clienteId]);
                refetch();
            }}
        />
    );
};

export default FichaCliente;
