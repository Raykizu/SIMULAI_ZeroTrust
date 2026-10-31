function angkaKeHuruf(angka) {
  const nilai = Number(angka);

  if (!Number.isFinite(nilai)) return null;
  if (nilai >= 85) return 'A';
  if (nilai >= 75) return 'B';
  if (nilai >= 65) return 'C';
  if (nilai >= 55) return 'D';
  return 'E';
}

module.exports = { angkaKeHuruf };
