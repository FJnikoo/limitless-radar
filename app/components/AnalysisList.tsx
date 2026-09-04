"use client";

import { useEffect, useState } from "react";

type AnalysisItem = {
  headline: {
    title: string;
    source: string;
    link: string;
  };
  analysis: {
    marketTitle: string;
    marketSlug: string;
    impact: string;
    confidence: number;
    horizon: string;
    analysis: string;
  };
};

export default function AnalysisList({ field }: { field: string }) {
  const [items, setItems] = useState<AnalysisItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/ai/analyze?field=${encodeURIComponent(field)}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Analysis failed.");
        }

        setItems(data.items ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [field]);

  if (loading) {
    return <p>Loading analysis...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  if (items.length === 0) {
    return <p>No clean Limitless market mapping for this field.</p>;
  }

    return (
    <section className="mx-auto mt-8 max-w-3xl space-y-4">
      {items.map((item) => (
        <article
          key={item.analysis.marketSlug}
          className="rounded-2xl border border-[#2a2c2b] bg-[#111312] p-5"
        >
          <p className="text-sm text-[#9aa19b]">{item.headline.source}</p>
          <h3 className="mt-2 text-lg font-semibold text-[#f4f5f2]">
            {item.headline.title}
          </h3>
          <p className="mt-3 text-sm text-[#c5cbc6]">
            {item.analysis.marketTitle}
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#9aa19b]">
            <span>{item.analysis.impact}</span>
            <span>Confidence: {item.analysis.confidence}/5</span>
            <span>{item.analysis.horizon}</span>
          </div>
          <p className="mt-4 leading-7 text-[#f4f5f2]">
            {item.analysis.analysis}
          </p>
        </article>
      ))}
    </section>
  );
}