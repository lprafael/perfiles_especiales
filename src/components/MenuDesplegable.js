import React, { useState, useEffect } from 'react';

function MenuDesplegable() {
    const [nombres, setNombres] = useState([]);
    const [error, setError] = useState(null);
    const [seleccionado, setSeleccionado] = useState('');

    useEffect(() => {
        const API_URL = 'http://localhost:3000/nombres'; // Asegúrate de que coincida con tu backend

        fetch(API_URL)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                setNombres(data);
            })
            .catch(err => {
                console.error('Error al cargar nombres:', err);
                setError('Error al cargar los nombres.');
            });
    }, []);

    const handleChange = (event) => {
        setSeleccionado(event.target.value);
        console.log('Seleccionado:', event.target.value);
        // Aquí puedes realizar otras acciones con el valor seleccionado
    };

    return (
        <div>
            <h2>Selecciona un Nombre:</h2>
            <select value={seleccionado} onChange={handleChange}>
                <option value="">Seleccione un nombre</option>
                {error && <option disabled>{error}</option>}
                {nombres.map((nombre, index) => (
                    <option key={index} value={nombre}>
                        {nombre}
                    </option>
                ))}
            </select>
            {seleccionado && <p>Has seleccionado: {seleccionado}</p>}
        </div>
    );
}

export default MenuDesplegable;