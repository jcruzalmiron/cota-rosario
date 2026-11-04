"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PointMap, type MapPoint } from "@/components/PointMap";
import { EmptyPlaces } from "@/components/residents/EmptyPlaces";
import { PlaceForm } from "@/components/residents/PlaceForm";
import { PlaceRow, findingFor, placeColor } from "@/components/residents/PlaceRow";
import { usePlaceReadings } from "@/components/residents/usePlaceReadings";
import { usePlaces } from "@/components/residents/usePlaces";
import { Workspace } from "@/components/shell/Workspace";
import type { AddressSuggestion } from "@/lib/addressSuggestions";
import type { TerrainMeta } from "@/lib/lookup";
import { createPlaceReader, geocode, type PlaceReader } from "@/lib/placeReader";
import { ADD_ERROR, MAX_PLACES, addPlace, removePlace, type Place } from "@/lib/places";
import { zoneReading, type ZoneView } from "@/lib/risk";

interface PlacesBoardProps {
  zones: ZoneView[];
}

const GEOLOCATION_TIMEOUT_MS = 10_000;
const NAME_FROM_ADDRESS_PARTS = 2;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PlacesBoard({ zones }: PlacesBoardProps) {
  const { places, available, ready, save } = usePlaces();
  const [reader] = useState<PlaceReader>(createPlaceReader);
  const [terrain, setTerrain] = useState<TerrainMeta | null>(null);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<{ lat: number; lon: number } | null>(null);
  const readingOf = usePlaceReadings(places, reader);

  useEffect(() => {
    reader.terrain().then(setTerrain).catch(() => setTerrain(null));
  }, [reader]);

  const zoneOf = useCallback((zone: string) => zoneReading(zones, zone), [zones]);

  const addToPlaces = (place: Place) => {
    const result = addPlace(places, place);
    if (result.error) {
      setMessage(ADD_ERROR[result.error]);
      return;
    }
    setMessage(save(result.places) ? null : "Este navegador no permite guardar lugares.");
    setAddress("");
    setName("");
    setCandidate(null);
    setSelectedId(place.id);
  };

  const addSuggestion = (suggestion: AddressSuggestion) => {
    setMessage(null);
    addToPlaces({ id: newId(), name: name.trim() || suggestion.label, lat: suggestion.lat, lon: suggestion.lon });
  };

  const addAddress = async (event: FormEvent) => {
    event.preventDefault();
    const term = address.trim();
    if (!term) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const found = await geocode(term);
      if (!found) {
        setMessage("No encontramos esa dirección dentro de Rosario.");
        return;
      }
      addToPlaces({ id: newId(), name: name.trim() || found.label.split(",").slice(0, NAME_FROM_ADDRESS_PARTS).join(","), lat: found.lat, lon: found.lon });
    } catch {
      setMessage("El buscador de direcciones no respondió. Probá de nuevo en un momento.");
    } finally {
      setBusy(false);
    }
  };

  const addCurrentLocation = () => {
    if (!("geolocation" in navigator)) {
      setMessage("Este dispositivo no comparte su ubicación.");
      return;
    }
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        addToPlaces({ id: newId(), name: name.trim() || "Mi ubicación", lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setBusy(false);
        setMessage("No pudimos obtener tu ubicación. Revisá el permiso del navegador.");
      },
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS },
    );
  };

  const full = places.length >= MAX_PLACES;
  const findings = places.map((place) => ({ place, state: readingOf(place), finding: findingFor(place, readingOf(place), zoneOf) }));
  const selected = places.find((place) => place.id === selectedId) ?? null;

  const points: MapPoint[] = findings.map(({ place, finding }) => ({ id: place.id, lat: place.lat, lon: place.lon, color: placeColor(finding), label: place.name, kind: "place", selected: place.id === selectedId }));

  const chooseOnMap = (lat: number, lon: number) => {
    if (full || !available) {
      return;
    }
    setMessage(null);
    setCandidate({ lat, lon });
  };

  const rail = (
    <div className="flex flex-col">
      <header className="px-5 pb-7 pt-2 lg:pt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Mi zona</h1>
          <p className="meta shrink-0">{ready ? places.length : 0} de {MAX_PLACES} lugares</p>
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft max-lg:line-clamp-2">Tu casa, el trabajo o la escuela: qué dicen el mapa oficial, el relieve y el historial de cada lugar. Se guardan sólo en este dispositivo.</p>
      </header>

      <div className="px-5 pb-10">
        {!available ? (
          <p className="rounded-xl border border-rule px-4 py-4 text-sm text-ink-soft">Este navegador no permite guardar datos (modo privado o almacenamiento bloqueado). Podés consultar direcciones desde el mapa.</p>
        ) : (
          <PlaceForm address={address} name={name} busy={busy} full={full} message={message} fullNotice={ADD_ERROR.full} onAddress={setAddress} onName={setName} onSearch={addAddress} onLocate={addCurrentLocation} onPick={addSuggestion} hint={full ? null : "También podés tocar el mapa para elegir un punto."} />
        )}
        {candidate ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-faint bg-panel-soft px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink">Punto elegido en el mapa</span>
              <span className="readout block text-[0.6875rem] text-ink-faint">{candidate.lat.toFixed(4)}, {candidate.lon.toFixed(4)} · podés arrastrarlo</span>
            </span>
            <button type="button" onClick={() => setCandidate(null)} className="text-xs text-ink-faint hover:text-ink">Descartar</button>
            <button type="button" onClick={() => addToPlaces({ id: newId(), name: name.trim() || `Lugar ${places.length + 1}`, lat: candidate.lat, lon: candidate.lon })} className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-ground hover:opacity-90">Guardar</button>
          </div>
        ) : null}
      </div>

      {ready ? (
        places.length ? (
          <section aria-labelledby="saved-places" className="px-5 pb-8">
          <h2 id="saved-places" className="meta pb-3">Tus lugares</h2>
          <ul className="overflow-hidden rounded-xl border border-rule bg-panel/40">
            {findings.map(({ place, state, finding }) => (
              <PlaceRow
                key={place.id}
                place={place}
                state={state}
                finding={finding}
                terrain={terrain}
                selected={place.id === selectedId}
                onSelect={() => setSelectedId((current) => (current === place.id ? null : place.id))}
                onRemove={() => {
                  save(removePlace(places, place.id));
                  setSelectedId(null);
                }}
              />
            ))}
          </ul>
          </section>
        ) : (
          <div className="px-5 pb-6">
            <EmptyPlaces />
          </div>
        )
      ) : null}
    </div>
  );

  return (
    <Workspace
      rail={rail}
      canvas={
        <PointMap
          points={points}
          pin={candidate ? { ...candidate, color: "#eceef1" } : null}
          focus={selected ? { lat: selected.lat, lon: selected.lon } : null}
          fitPoints={!selected && !candidate && places.length > 0}
          onMapClick={chooseOnMap}
          onPinMove={(lat, lon) => setCandidate({ lat, lon })}
          onPointSelect={setSelectedId}
          crosshair={available && !full}
        />
      }
    />
  );
}
