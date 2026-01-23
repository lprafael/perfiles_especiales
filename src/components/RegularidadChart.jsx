import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function RegularidadChart({ horas, actual, promedio }) {
  const data = {
    labels: horas.map((h) => `${h}:00`),
    datasets: [
      {
        label: "Actual (buses por hora)",
        data: actual,
        borderColor: "#1976d2",
        backgroundColor: "rgba(25,118,210,0.1)",
        tension: 0.2,
        fill: false,
      },
      {
        label: "Promedio histórico",
        data: promedio,
        borderColor: "#ff9800",
        backgroundColor: "rgba(255,152,0,0.1)",
        borderDash: [6, 4],
        tension: 0.2,
        fill: false,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: false },
      tooltip: { mode: "index", intersect: false },
    },
    interaction: { mode: "nearest", axis: "x", intersect: false },
    scales: {
      x: { title: { display: true, text: "Hora del día" } },
      y: { title: { display: true, text: "Cantidad de buses" }, beginAtZero: true },
    },
  };
  return <Line data={data} options={options} />;
}
