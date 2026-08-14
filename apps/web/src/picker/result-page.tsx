import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PublicHeader } from "../public-header";
import {
  loadPublicPickerResult,
  pickerResultDrinkPath,
  pickerResultStorePath,
  type PickerResult
} from "./result-data";

function formatPrice(priceCents: number | null, currency: string) {
  if (priceCents === null) return null;
  return new Intl.NumberFormat("en-NZ", {
    currency,
    style: "currency"
  }).format(priceCents / 100);
}

function ResultImage({ result }: { result: PickerResult }) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = result.drink.imageUrl;
  if (imageUrl && !hasImageError) {
    return (
      <img
        alt={result.drink.imageAltText ?? result.drink.name}
        className="picker-result-image"
        src={imageUrl}
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div aria-hidden="true" className="picker-result-image-fallback">
      Selected drink image
    </div>
  );
}

function ResultCard({ result }: { result: PickerResult }) {
  const drinkPath = pickerResultDrinkPath(result);
  const price = formatPrice(result.store.priceCents, result.store.currency);
  return (
    <article
      className="picker-result-card"
      data-node-id="63:145"
      aria-labelledby="picker-result-drink-heading"
    >
      <ResultImage result={result} />
      <div className="picker-result-card-content">
        <p className="picker-result-fortune">{result.craving.fortune}</p>
        <h2 id="picker-result-drink-heading">{result.drink.name}</h2>
        <p className="picker-result-store">
          {result.store.displayName} · {result.store.suburb}, Auckland
        </p>
        {price ? (
          <p className="picker-result-price">Available here · {price}</p>
        ) : null}
        <Link className="picker-result-primary-link" to={drinkPath}>
          View drink <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

function ResultNextStep({ result }: { result: PickerResult }) {
  return (
    <aside
      className="picker-result-next-step"
      aria-labelledby="next-step-heading"
    >
      <p className="picker-result-eyebrow">ONE DECISIVE NEXT STEP</p>
      <h2 id="next-step-heading">
        Get this drink at {result.store.displayName}.
      </h2>
      <p>
        This drink is currently available in {result.store.suburb}. Start with
        the drink, then choose your route.
      </p>
      <Link className="picker-result-action" to={pickerResultStorePath(result)}>
        Find this drink
      </Link>
      <Link className="picker-result-action" to="/picker">
        Pick again
      </Link>
    </aside>
  );
}

function PickerResultLoading() {
  return (
    <section
      className="picker-result-loading"
      role="status"
      aria-label="Loading your milk tea sign"
    >
      <div className="picker-result-skeleton picker-result-skeleton-label" />
      <div className="picker-result-skeleton picker-result-skeleton-title" />
      <div className="picker-result-skeleton picker-result-skeleton-card" />
    </section>
  );
}

function PickerResultMessage({
  kind,
  onRetry
}: {
  kind: "stale" | "not_found" | "error";
  onRetry?: () => void;
}) {
  const isError = kind === "error";
  const title = isError
    ? "Couldn't load your milk tea sign."
    : kind === "stale"
      ? "The sign needs another draw."
      : "We couldn't find this milk tea sign.";
  const description = isError
    ? "Please try again. Your recommendation is still encoded in this link."
    : kind === "stale"
      ? "This recommendation is no longer available at the selected store."
      : "This result may have expired, or the link may be incomplete.";

  return (
    <section
      className="picker-result-message"
      role={isError ? "alert" : "status"}
    >
      <p className="picker-result-eyebrow">YOUR MILK TEA SIGN</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="picker-result-message-actions">
        <Link className="picker-result-action" to="/picker">
          Pick again
        </Link>
        {isError && onRetry ? (
          <button
            className="picker-result-secondary-action"
            type="button"
            onClick={onRetry}
          >
            Try again
          </button>
        ) : null}
        <Link className="picker-result-secondary-action" to="/drinks">
          Browse drinks
        </Link>
      </div>
    </section>
  );
}

function setResultMetadata(result: PickerResult | null) {
  document.title = result
    ? `${result.drink.name} — Your Milk Tea Sign | WeMilktea`
    : "Your Milk Tea Sign | WeMilktea";
  const description = result
    ? `${result.drink.name} at ${result.store.displayName}. Your canonical WeMilktea Picker result.`
    : "Your Daily Milk Tea Picker result on WeMilktea.";
  let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.name = "description";
    document.head.appendChild(tag);
  }
  tag.content = description;
}

export function PickerResultPage() {
  const { brandSlug, productSlug } = useParams();
  const [searchParams] = useSearchParams();
  const storeSlug = searchParams.get("store");
  const craving = searchParams.get("craving");
  const [result, setResult] = useState<PickerResult | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "stale" | "not_found" | "error"
  >("loading");

  const load = useCallback(async () => {
    if (!brandSlug || !productSlug) {
      setResult(null);
      setStatus("not_found");
      return;
    }
    setResult(null);
    setStatus("loading");
    const loaded = await loadPublicPickerResult(
      brandSlug,
      productSlug,
      storeSlug,
      craving
    );
    if (loaded.error === "stale") setStatus("stale");
    else if (loaded.error === "not_found") setStatus("not_found");
    else if (loaded.error) setStatus("error");
    else {
      setResult(loaded.data);
      setStatus("ready");
    }
  }, [brandSlug, craving, productSlug, storeSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setResultMetadata(result);
  }, [result]);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="picker-result-page">
        {status === "loading" ? <PickerResultLoading /> : null}
        {status === "ready" && result ? (
          <>
            <p className="picker-result-eyebrow">YOUR MILK TEA SIGN</p>
            <h1 className="picker-result-heading">The sign has spoken.</h1>
            <div className="picker-result-split">
              <ResultCard result={result} />
              <ResultNextStep result={result} />
            </div>
            <div className="picker-result-sticky-action" data-node-id="61:173">
              <span>Picker Result</span>
              <Link to="/picker">Pick again</Link>
            </div>
          </>
        ) : null}
        {status === "stale" ? <PickerResultMessage kind="stale" /> : null}
        {status === "not_found" ? (
          <PickerResultMessage kind="not_found" />
        ) : null}
        {status === "error" ? (
          <PickerResultMessage kind="error" onRetry={() => void load()} />
        ) : null}
      </main>
    </div>
  );
}
