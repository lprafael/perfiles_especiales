// Utilidad para exportar a Word usando docx
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from 'docx';

export async function exportarReporteWord({
  titulo,
  descripcion,
  imagenMapaBase64,
  fechaMonitoreo,
  datosSidebar,
  fechaGeneracion,
  cierre,
  empresa
}) {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: titulo,
            heading: HeadingLevel.HEADING_1,
            alignment: 'center',
          }),
          new Paragraph({ text: '' }),
          empresa && new Paragraph({
            text: `Empresa monitoreada: ${empresa}`,
            heading: HeadingLevel.HEADING_2
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: descripcion }),
          new Paragraph({ text: '' }),
          // Imagen del mapa (solo PNG soportado por docx)
          (imagenMapaBase64 && imagenMapaBase64.startsWith('data:image/png')) ? new Paragraph({
            children: [
              new ImageRun({
                data: Uint8Array.from(atob(imagenMapaBase64.split(',')[1]), c => c.charCodeAt(0)),
                transformation: { width: 500, height: 300 },
              })
            ],
            alignment: 'center',
          }) : imagenMapaBase64 ? new Paragraph({
            children: [
              new TextRun({
                text: 'No se pudo insertar la imagen: solo se soportan imágenes PNG para Word.',
                color: 'ff0000',
              })
            ]
          }) : null,
          new Paragraph({ text: '' }),
          new Paragraph({
            text: `Fecha de monitoreo: ${fechaMonitoreo}`
          }),
          new Paragraph({ text: '' }),
          ...datosSidebar.split('\n').map(linea => new Paragraph({ text: linea })),
          new Paragraph({ text: '' }),
          new Paragraph({
            text: `Fecha y hora de generación del reporte: ${fechaGeneracion}`
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: cierre }),
        ].filter(Boolean)
      }
    ]
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'ReporteSimulacion.docx');
}
