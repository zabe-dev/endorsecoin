export type LogoDraft = {
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  dataUrl: string;
};

export function handleLogoFile(
  file: File,
  setDraft: (draft: LogoDraft) => void,
  setError: (message: string) => void,
) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    setError('Please use a PNG, JPG, JPEG, or WEBP file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    loadImage(dataUrl)
      .then((image) => {
        if (image.width < 100 || image.height < 100) {
          setError('Logo files must be at least 100 × 100.');
          return;
        }
        setError('');
        setDraft({
          name: file.name,
          mimeType: file.type as LogoDraft['mimeType'],
          width: image.width,
          height: image.height,
          dataUrl,
        });
      })
      .catch(() => setError('Could not read that image file.'));
  };
  reader.readAsDataURL(file);
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
