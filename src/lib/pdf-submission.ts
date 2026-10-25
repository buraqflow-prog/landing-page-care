import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type MergedSubmission = { blob: Blob; fileName: string; url: string };

const maxImageWidth = 1200;

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxImageWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز الصورة");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("تعذر ضغط الصورة"))), "image/jpeg", 0.75);
  });
}

export async function buildMergedSubmission({
  exerciseId,
  exerciseTitle,
  studentName,
  files,
}: {
  exerciseId: string;
  exerciseTitle: string;
  studentName: string;
  files: File[];
}): Promise<MergedSubmission> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const cover = pdf.addPage([595.28, 841.89]);
  cover.drawText("Exercise submission", { x: 50, y: 770, size: 22, font, color: rgb(0.12, 0.12, 0.16) });
  cover.drawText(exerciseTitle, { x: 50, y: 720, size: 16, font });
  cover.drawText(`Student: ${studentName}`, { x: 50, y: 690, size: 14, font });
  cover.drawText("Handwritten solution pages follow.", { x: 50, y: 650, size: 12, font, color: rgb(0.35, 0.35, 0.4) });

  for (const file of files) {
    const compressed = await compressImage(file);
    const image = await pdf.embedJpg(await compressed.arrayBuffer());
    const page = pdf.addPage([595.28, 841.89]);
    const margin = 28;
    const ratio = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height);
    const width = image.width * ratio;
    const height = image.height * ratio;
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  }

  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const fileName = `Exercise_${exerciseId}_${studentName.replaceAll(" ", "_")}.pdf`;
  return { blob, fileName, url: URL.createObjectURL(blob) };
}