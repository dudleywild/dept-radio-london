"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [votedSongIds, setVotedSongIds] = useState<string[]>([]);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Helper to trigger Spotify sync
  const triggerSpotifySync = async () => {
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch (e) {
      console.error("Sync trigger error:", e);
    }
  };

  useEffect(() => {
    const savedVotes = localStorage.getItem("dept_radio_votes");
    if (savedVotes) {
      setVotedSongIds(JSON.parse(savedVotes));
    }
  }, []);

  const fetchQueue = async () => {
    const { data, error } = await supabase
      .from("queue")
      .select("*")
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: true });

    if (!error && data) {
      setQueue(data);
    }
  };

  // Poll Spotify every 10 seconds for currently playing track, sync queue & weekly wipes
  useEffect(() => {
    fetchQueue();

    const checkNowPlayingAndSync = async () => {
      try {
        await triggerSpotifySync(); // Triggers removal of played songs from Spotify & Supabase
        await fetchQueue();        // Refreshes UI queue
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    checkNowPlayingAndSync();
    const interval = setInterval(checkNowPlayingAndSync, 10000);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsSearching(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Live Search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        console.log("Spotify Search Data:", data);

        const items = data.tracks?.items || [];
        setSearchResults(items);
        setIsSearching(true);
      } catch (err) {
        console.error("Search fetch error:", err);
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Add song to queue & sync
  const addToQueue = async (track: any) => {
    const newSong = {
      spotify_id: track.id,
      title: track.name,
      artist: track.artists[0]?.name || "Unknown Artist",
      image_url: track.album?.images[0]?.url || "",
      upvotes: 1,
    };

    const { error } = await supabase.from("queue").insert([newSong]);

    if (error) {
      if (error.code === "23505") {
        alert("This song is already in the queue!");
      } else {
        console.error("Error adding song:", error);
      }
    } else {
      setQuery("");
      setSearchResults([]);
      setIsSearching(false);
      await fetchQueue();
      await triggerSpotifySync();
    }
  };

  // Upvote song & sync
  const handleUpvote = async (id: string, currentVotes: number) => {
    if (votedSongIds.includes(id)) return;

    const newVotes = currentVotes + 1;

    const { error } = await supabase
      .from("queue")
      .update({ upvotes: newVotes })
      .eq("id", id);

    if (!error) {
      const updatedVotes = [...votedSongIds, id];
      setVotedSongIds(updatedVotes);
      localStorage.setItem("dept_radio_votes", JSON.stringify(updatedVotes));
      await fetchQueue();
      await triggerSpotifySync();
    }
  };

  return (
    <main className="min-h-screen bg-white text-black flex flex-col relative">
      
      {/* FIXED TOP LEFT HEADER */}
      <div className={`fixed left-8 text-[18px] font-medium tracking-wide z-[60] transition-all duration-300 ${isScrolled ? 'top-8' : 'top-6'}`}>
        DEPT® RADIO | LONDON
      </div>

      {/* LOGO CONTAINER */}
      <div className="pt-6 pb-6 text-center flex flex-col items-center">
        <img
          src="https://www.deptagency.com/wp-content/uploads/2025/10/logo-dept.svg"
          alt="DEPT Logo"
          className="h-[102px]" 
        />
      </div>

      {/* STICKY SEARCH BAR CONTAINER */}
      <div className={`sticky top-0 z-50 w-full bg-white transition-all duration-300 flex items-center justify-center ${isScrolled ? 'py-4 border-b border-gray-200 shadow-sm' : 'pb-12 pt-4'}`}>
        <div ref={dropdownRef} className="w-full max-w-xl relative px-4">
          
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search for a song or artist to add..."
              value={query}
              onFocus={() => { if (searchResults.length > 0) setIsSearching(true); }}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-6 pr-12 py-3 rounded-full bg-white border border-gray-300 focus:outline-none focus:border-black transition-colors text-base shadow-sm"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
          </div>

          {/* SEARCH DROPDOWN */}
          {isSearching && searchResults.length > 0 && (
            <div className="absolute top-full left-4 right-4 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden z-50 max-h-[380px] overflow-y-auto divide-y divide-gray-100">
              {searchResults.map((track: any) => (
                <div 
                  key={track.id} 
                  className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-3 overflow-hidden pr-2">
                    <img 
                      src={track.album?.images?.[2]?.url || track.album?.images?.[0]?.url} 
                      alt={track.name} 
                      className="w-11 h-11 rounded object-cover flex-shrink-0" 
                    />
                    <div className="truncate">
                      <p className="font-semibold text-sm truncate text-black">{track.name}</p>
                      <p className="text-xs text-gray-500 truncate">{track.artists[0]?.name}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => addToQueue(track)}
                    className="bg-black text-white hover:bg-gray-800 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex-shrink-0"
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* MAIN QUEUE GRID */}
      <div className="px-8 pb-8 flex-1">
        {queue.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            No songs in the queue yet. Search for a song above to add one!
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {queue.map((song: any) => {
              const hasVoted = votedSongIds.includes(song.id);

              return (
                <div 
                  key={song.id} 
                  onClick={() => handleUpvote(song.id, song.upvotes)}
                  className={`relative group aspect-square bg-gray-100 rounded-md overflow-hidden shadow-sm transition-transform duration-200 ${
                    hasVoted ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02]'
                  }`}
                >
                  <img src={song.image_url} alt={song.title} className="w-full h-full object-cover" />
                  
                  {/* HEART & VOTE COUNT BADGE */}
                  <div
                    className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md transition-all z-10 ${
                      hasVoted 
                        ? 'bg-red-500 text-white' 
                        : 'bg-white/90 text-black group-hover:scale-110'
                    }`}
                  >
                    <span className={hasVoted ? 'text-white' : 'text-red-500'}>♥</span>
                    <span>{song.upvotes}</span>
                  </div>

                  {/* HOVER OVERLAY */}
                  <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center text-white">
                    <p className="font-bold text-sm line-clamp-2">{song.title}</p>
                    <p className="text-gray-300 text-xs mt-1 mb-4">{song.artist}</p>
                    
                    <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-transform ${
                      hasVoted 
                        ? 'bg-red-500 text-white' 
                        : 'bg-white text-black hover:scale-105'
                    }`}>
                      {hasVoted ? 'Upvoted ✓' : 'Click to upvote'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </main>
  );
}