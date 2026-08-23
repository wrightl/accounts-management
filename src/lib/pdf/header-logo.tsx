import { Image as PdfImage, StyleSheet, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 20,
    right: 48,
  },
  image: {
    width: 56,
    height: 56,
    objectFit: "contain",
  },
});

export function PdfHeaderLogo({ src }: { src: string }) {
  return (
    <View style={styles.wrap} fixed>
      <PdfImage src={src} style={styles.image} />
    </View>
  );
}
