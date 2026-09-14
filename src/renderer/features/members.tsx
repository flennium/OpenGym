// @ts-nocheck -- renderer records are validated at the IPC boundary.
// Renderer data is validated by shared IPC contracts before it reaches these views.
import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Archive, Camera, FileText, Plus, Search, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { Badge, DataToolbar, Field, Modal, Page, Table } from "../components/ui";
import { api, notifySuccess, confirmWithPin } from "../app/runtime";
export function FaceCapture({
  title,
  requireConsent = false,
  onCapture,
  onClose,
}: any) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [consent, setConsent] = useState(!requireConsent);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(true);
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((media) => {
        if (!mounted) return media.getTracks().forEach((track) => track.stop());
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play();
        }
        setStarting(false);
      })
      .catch(() => {
        setStarting(false);
        setCameraError(
          "Camera access failed. Check the camera connection and Windows privacy permission.",
        );
      });
    return () => {
      mounted = false;
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const capture = async () => {
    const source = video.current;
    if (!source?.videoWidth) return;
    setProcessing(true);
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    canvas.getContext("2d")!.drawImage(source, 0, 0);
    try {
      await onCapture(canvas.toDataURL("image/jpeg", 0.9));
    } finally {
      setProcessing(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose} className="faceCaptureModal">
      <div className="faceCapture">
        <section className="cameraStage">
          <div className="cameraViewport">
            <video ref={video} muted playsInline />
            <div className="cameraTopline">
              <span className={starting ? "starting" : "ready"}>
                <i /> {starting ? "Connecting" : "Camera ready"}
              </span>
              <span><ShieldCheck /> Local only</span>
            </div>
            <svg className="faceGuide" viewBox="0 0 360 440" aria-hidden="true">
              <path className="faceContour" d="M180 42C111 42 76 94 76 168c0 48 17 84 39 110 15 18 24 40 29 65l4 19h64l4-19c5-25 14-47 29-65 22-26 39-62 39-110 0-74-35-126-104-126Z" />
              <path className="faceEyeLine" d="M105 181h150" />
              <path className="faceCenterLine" d="M180 102v152" />
              <path className="faceCorner cornerOne" d="M58 116V72h44" />
              <path className="faceCorner cornerTwo" d="M258 72h44v44" />
              <path className="faceCorner cornerThree" d="M58 322v44h44" />
              <path className="faceCorner cornerFour" d="M258 366h44v-44" />
            </svg>
            <div className="cameraFootline">
              <span>{processing ? "Creating secure template…" : "Hold still and look ahead"}</span>
              <span className="qualityMeter" aria-hidden="true"><i /><i /><i /></span>
            </div>
            {processing && <div className="captureFlash" />}
            {starting && <div className="cameraMessage"><span className="cameraLoader" />Starting camera…</div>}
            {cameraError && <div className="cameraMessage error"><TriangleAlert />{cameraError}</div>}
          </div>
        </section>
        <div className="captureBrief">
          <div className="captureBriefIntro">
            <span className="captureStep">1</span>
            <div><b>Set your position</b><small>Fill the contour naturally. You do not need to touch the screen.</small></div>
          </div>
          <ul className="captureChecks">
            <li><i /> Face the camera directly</li>
            <li><i /> Keep eyes visible</li>
            <li><i /> Make sure nobody else is in frame</li>
          </ul>
          <div className="privacyNote"><ShieldCheck /><div><b>The image stays here</b><small>OpenGym converts this frame into a numeric face template. The captured frame is not retained.</small></div></div>
          {requireConsent && (
            <label className="consentCheck">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span><b>Member consent confirmed</b><small>The member agrees to local biometric enrollment.</small></span>
            </label>
          )}
          <div className="captureAction">
            <small>{cameraError ? "Reconnect the camera to continue" : !consent ? "Confirm consent to continue" : "One clear frame is enough"}</small>
            <button type="button" className="primary" disabled={!consent || starting || processing || !!cameraError} onClick={() => void capture()}>
              <Camera /> {processing ? "Checking face…" : "Capture face"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function MemberForm({ close, refresh, member }: any) {
  const [photoPreview, setPhotoPreview] = useState(member?.photoDataUrl || "");
  const [faceCapture, setFaceCapture] = useState("");
  const [showFaceEnrollment, setShowFaceEnrollment] = useState(false);
  const [faceStatus, setFaceStatus] = useState<any>(null);
  const [faceFeature, setFaceFeature] = useState<any>(null);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [documents, setDocuments] = useState<Record<number, any>>({});
  useEffect(() => {
    api("documents:requirements").then(setRequirements);
    api("faces:status").then(setFaceFeature);
    if (member?.id)
      api("faces:memberStatus", { memberId: member.id }).then(setFaceStatus);
  }, []);
  const { register, handleSubmit, setValue, watch } = useForm({
    defaultValues: member
      ? {
          firstName: member.first_name,
          lastName: member.last_name,
          phone: member.phone || "",
          email: member.email || "",
          dateOfBirth: member.date_of_birth || "",
          gender: member.gender || "",
          address: member.address || "",
          emergencyName: member.emergency_name || "",
          emergencyPhone: member.emergency_phone || "",
          status: member.status,
          notes: member.notes || "",
          photoPath: member.photo_path || null,
        }
      : {
          firstName: "",
          lastName: "",
          phone: "",
          email: "",
          dateOfBirth: "",
          gender: "",
          address: "",
          emergencyName: "",
          emergencyPhone: "",
          status: "active",
          notes: "",
          photoPath: null,
        },
  });
  return (
    <Modal title={member ? "Edit member" : "Add member"} onClose={close}>
      <form
        onSubmit={handleSubmit(async (data) => {
          const memberId = await api("members:save", {
            id: member?.id,
            data: {
              ...data,
              documents: Object.entries(documents).map(
                ([requirementId, document]) => ({
                  requirementId: +requirementId,
                  path: (document as any).path,
                }),
              ),
            },
          });
          if (faceCapture)
            await api("faces:enroll", {
              memberId,
              imageDataUrl: faceCapture,
              consent: true,
            });
          refresh();
          close();
          notifySuccess(member ? "Member updated." : "Member added.");
        })}
      >
        <div className="photoPicker">
          <div className="avatar">
            {photoPreview ? (
              <img src={photoPreview} alt="Member preview" />
            ) : (
              watch("firstName")?.[0] || <Users />
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={async () => {
                const photo = await api("members:choosePhoto");
                if (photo) {
                  setValue("photoPath", photo.path);
                  setPhotoPreview(photo.dataUrl);
                }
              }}
            >
              Choose photo
            </button>
            <small>
              {watch("photoPath") ? "Photo selected" : "PNG, JPG, or WebP"}
            </small>
          </div>
        </div>
        {faceFeature?.enabled && (
          <section className="faceEnrollmentRow">
            <div
              className={`faceEnrollmentIcon ${faceStatus || faceCapture ? "enrolled" : ""}`}
            >
              <Camera />
            </div>
            <div>
              <b>
                {faceStatus || faceCapture
                  ? "Face enrolled"
                  : "Face recognition"}
              </b>
              <small>
                {faceCapture
                  ? "New capture ready to save"
                  : faceStatus
                    ? `InsightFace · enrolled ${new Date(faceStatus.updatedAt).toLocaleDateString()}`
                    : "Optional local kiosk identification"}
              </small>
            </div>
            <button type="button" onClick={() => setShowFaceEnrollment(true)}>
              {faceStatus || faceCapture ? "Replace" : "Enroll face"}
            </button>
          </section>
        )}
        {!!requirements.length && (
          <section className="documentChecklist">
            <header>
              <div>
                <h3>Required documents</h3>
                <p>
                  Attach a scan, photo, or PDF for each item before saving this
                  member.
                </p>
              </div>
              <FileText />
            </header>
            {requirements.map((requirement) => {
              const stored = member?.documents?.find(
                (document: any) => document.requirementId === requirement.id,
              );
              const selected = documents[requirement.id];
              return (
                <div
                  className={selected || stored ? "complete" : ""}
                  key={requirement.id}
                >
                  <span>
                    <b>{requirement.name}</b>
                    <small>
                      {selected?.name || stored?.fileName || "Not attached"}
                    </small>
                  </span>
                  <span className="documentActions">
                    {stored && !selected && (
                      <button
                        type="button"
                        onClick={() =>
                          api("members:openDocument", {
                            id: stored.id,
                            memberId: member.id,
                          })
                        }
                      >
                        Open
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const document = await api("members:chooseDocument");
                        if (document)
                          setDocuments((current) => ({
                            ...current,
                            [requirement.id]: document,
                          }));
                      }}
                    >
                      {selected || stored ? "Replace" : "Attach file"}
                    </button>
                  </span>
                </div>
              );
            })}
          </section>
        )}
        <div className="grid2">
          <Field required label="First name" {...register("firstName")} />
          <Field required label="Last name" {...register("lastName")} />
          <Field label="Phone" {...register("phone")} />
          <Field label="Email" type="email" {...register("email")} />
          <Field
            label="Date of birth"
            type="date"
            {...register("dateOfBirth")}
          />
          <Field label="Address" {...register("address")} />
          <label>
            <span>Gender</span>
            <select {...register("gender")}>
              <option value="">Not specified</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select {...register("status")}>
              <option>active</option>
              <option>inactive</option>
              <option>banned</option>
            </select>
          </label>
          <Field label="Emergency contact" {...register("emergencyName")} />
          <Field label="Emergency phone" {...register("emergencyPhone")} />
        </div>
        <label>
          <span>Notes</span>
          <textarea {...register("notes")} />
        </label>
        <footer>
          <button className="primary">Save member</button>
        </footer>
      </form>
      {showFaceEnrollment && (
        <FaceCapture
          title="Enroll member face"
          requireConsent
          onCapture={(imageDataUrl) => {
            setFaceCapture(imageDataUrl);
            setShowFaceEnrollment(false);
          }}
          onClose={() => setShowFaceEnrollment(false)}
        />
      )}
    </Modal>
  );
}
export function Members({ settings, user, can }: any) {
  const [rows, setRows] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [editing, setEditing] = useState<any>(null);
  const load = () => api("members:list", { search: "" }).then(setRows);
  useEffect(() => {
    void load();
  }, []);
  const visibleRows = rows.filter(
    (member) =>
      (!status || member.status === status) &&
      [
        member.first_name,
        member.last_name,
        member.phone,
        member.email,
        member.member_code,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
  );
  return (
    <Page
      title="Members"
      action={
        <div className="headActions">
          <button onClick={() => api("export:csv", { module: "members" })}>
            Export CSV
          </button>
          {can("Members", "create") && (
            <button className="primary" onClick={() => setEditing({})}>
              <Plus />
              Add member
            </button>
          )}
        </div>
      }
    >
      <DataToolbar
        label="Search members"
        value={search}
        onChange={setSearch}
        placeholder="Name, phone, email, or chip ID"
        shown={visibleRows.length}
        total={rows.length}
        filters={[
          {
            label: "Member status",
            value: status,
            onChange: setStatus,
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "banned", label: "Banned" },
            ],
          },
        ]}
      />
      <Table
        heads={[
          "Member",
          "Chip ID",
          "Contact",
          "Status",
          "Membership ends",
          "Actions",
        ]}
        rows={visibleRows.map((m) => [
          <b>
            {m.first_name} {m.last_name}
          </b>,
          <span className="memberCode">{m.member_code}</span>,
          m.phone || m.email || "—",
          <Badge text={m.status} />,
          m.membership_end || "No active membership",
          <div className="actions">
            {can("Members", "edit") && (
              <button
                onClick={async () => {
                  const profile = await api("members:get", { id: m.id });
                  setEditing(profile.member);
                }}
              >
                Edit
              </button>
            )}
            {can("Members", "delete") && (
              <button
                onClick={async () => {
                  const authorizationPin = await confirmWithPin({
                    title: "Archive this member?",
                    message: `${m.first_name} ${m.last_name} will disappear from active lists. Enter your current PIN to authorize this action. Their history remains preserved.`,
                    confirmLabel: "Archive member",
                    tone: "danger",
                  });
                  if (authorizationPin) {
                    try {
                      await api("members:archive", {
                        id: m.id,
                        authorizationPin,
                      });
                    } catch {
                      return;
                    }
                    await load();
                    notifySuccess("Member archived.");
                  }
                }}
              >
                Archive
              </button>
            )}
          </div>,
        ])}
      />
      {editing && (
        <MemberForm
          member={editing.id ? editing : null}
          close={() => setEditing(null)}
          refresh={load}
        />
      )}
    </Page>
  );
}