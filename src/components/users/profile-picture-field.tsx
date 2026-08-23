"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { removeProfilePicture, uploadProfilePicture } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { prepareProfilePhoto } from "@/lib/profile-photo-client";
import { cn } from "@/lib/utils";

function userInitials(userName: string | null): string {
  if (!userName) return "?";
  const parts = userName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function ProfileAvatar({
  avatarUrl,
  previewUrl,
  userName,
  className,
}: {
  avatarUrl: string | null;
  previewUrl: string | null;
  userName: string | null;
  className?: string;
}) {
  const src = previewUrl ?? avatarUrl;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn("rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full bg-wash text-lg font-medium text-muted",
        className,
      )}
    >
      {userInitials(userName)}
    </span>
  );
}

function CameraCaptureDialog({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not supported in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch {
        setError("Could not access the camera. Check permissions and try again.");
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const maxDim = 1024;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(
          new File([blob], `profile-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );
      },
      "image/jpeg",
      0.85,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
        aria-label="Close camera"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-lg font-semibold">Take a photo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-muted transition-colors hover:bg-wash hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[4/3] w-full rounded-xl bg-black object-cover"
            />
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!ready || Boolean(error)} onClick={capturePhoto}>
              Capture photo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfilePictureField({
  avatarUrl,
  userName,
  clerkConfigured,
}: {
  avatarUrl: string | null;
  userName: string | null;
  clerkConfigured: boolean;
}) {
  const router = useRouter();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setPreview(file: File | null) {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function uploadFile(file: File) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const prepared = await prepareProfilePhoto(file);
        setPreview(prepared);

        const formData = new FormData();
        formData.set("photo", prepared);
        const result = await uploadProfilePicture(formData);
        if (!result.ok) {
          setError(result.error);
          setPreview(null);
          return;
        }
        setMessage("Profile picture updated.");
        setPreview(null);
        router.refresh();
      } catch {
        setError("Upload failed. Check your connection and try again.");
        setPreview(null);
      }
    });
  }

  function handleFileSelected(file: File | null) {
    if (!file) return;
    uploadFile(file);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function handleRemove() {
    setError(null);
    setMessage(null);
    setPreview(null);
    startTransition(async () => {
      try {
        const result = await removeProfilePicture();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage("Profile picture removed.");
        router.refresh();
      } catch {
        setError("Could not remove profile picture. Try again.");
      }
    });
  }

  if (!clerkConfigured) {
    return (
      <div className="space-y-2 border-b border-border pb-8">
        <h2 className="font-display text-lg font-semibold">Profile picture</h2>
        <ProfileAvatar
          avatarUrl={avatarUrl}
          previewUrl={null}
          userName={userName}
          className="h-24 w-24"
        />
        <p className="text-sm text-muted">
          Connect Clerk to upload a profile picture.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 border-b border-border pb-8">
        <h2 className="font-display text-lg font-semibold">Profile picture</h2>
        <ProfileAvatar
          avatarUrl={avatarUrl}
          previewUrl={previewUrl}
          userName={userName}
          className="h-24 w-24"
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={pending}
          onChange={(event) => handleFileSelected(event.target.files?.[0] ?? null)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          disabled={pending}
          onChange={(event) => handleFileSelected(event.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => uploadInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {pending ? "Uploading…" : "Upload photo"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
                setCameraOpen(true);
                return;
              }
              cameraInputRef.current?.click();
            }}
          >
            <Camera className="h-4 w-4" />
            Take photo
          </Button>
          {avatarUrl ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={handleRemove}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          JPEG, PNG, WebP, or GIF up to 2 MB. On mobile, Take photo opens your camera.
        </p>
        <FieldError>{error}</FieldError>
        {message ? <p className="text-sm text-success">{message}</p> : null}
      </div>

      {cameraOpen ? (
        <CameraCaptureDialog
          onCapture={(file) => {
            setCameraOpen(false);
            uploadFile(file);
          }}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </>
  );
}
