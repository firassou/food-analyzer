"use client";
import React, { useCallback, useRef, useState } from "react";
import CameraCapture from "./CameraCapture";

/**
 * Everything needed to get a photo: the camera (native app on phones, in-page
 * viewfinder elsewhere) and the file picker. `elements` must be rendered once;
 * `takePhoto` / `choosePhoto` can then be called from any button on the page.
 */
export function usePhotoPicker(onFile: (file: File) => void) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
    // allow re-selecting the same file
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const choosePhoto = useCallback(() => fileRef.current?.click(), []);

  const takePhoto = useCallback(() => {
    // phones and tablets: the native camera app (focus, flash, full resolution) reads small
    // print best. Elsewhere `capture` is ignored, so open the webcam in the page instead.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch || !navigator.mediaDevices?.getUserMedia) cameraRef.current?.click();
    else setCameraOpen(true);
  }, []);

  const elements = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            setCameraOpen(false);
            onFile(file);
          }}
          onClose={() => setCameraOpen(false)}
          onChooseFile={() => {
            setCameraOpen(false);
            choosePhoto();
          }}
        />
      )}
    </>
  );

  return { takePhoto, choosePhoto, elements };
}
