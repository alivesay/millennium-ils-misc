#!/usr/bin/env ruby

require "net/https"
require "uri"
require "rubygems"
require "pp"
require "multimap"

module PAPIWrapper
  PATRON_API_SERVER = "catalog.yourlibrary.org"
  PATRON_API_PORT   = 54620

  @@patron_api_field_map = {"REC INFO"      => "record_info",
                            "EXP DATE"      => "expiration_date",
                            "PCODE1"        => "patron_code1",
                            "PCODE2"        => "patron_code2",
                            "PCODE3"        => "patron_code3",
                            "P TYPE"        => "p_type",
                            "TOT CHKOUT"    => "total_checkouts",
                            "TOT RENWAL"    => "total_renewals",
                            "CUR CHKOUT"    => "current_checkouts",
                            "BIRTH DATE"    => "birthday",
                            "HOME LIBR"     => "home_library",
                            "PMESSAGE"      => "patron_message",
                            "MBLOCK"        => "mblock",
                            "REC TYPE"      => "record_type",
                            "RECORD #"      => "record_number",
                            "REC LENG"      => "record_length",
                            "CREATED"       => "created_on",
                            "UPDATED"       => "updated_on",
                            "REVISIONS"     => "revisions",
                            "AGENCY"        => "agency",
                            "CL RTRND"      => "claimed_returned",
                            "MONEY OWED"    => "money_owed",
                            "CUR ITEMA"     => "current_item_a",
                            "CUR ITEMB"     => "current_item_b",
                            "CUR ITEMC"     => "current_item_c",
                            "CUR ITEMD"     => "current_item_d",
                            "CIRCACTIVE"    => "last_circ_activity_on",
                            "NOTICE PREF"   => "notice_preference",
                            "PATRN NAME"    => "patron_name",
                            "ADDRESS"       => "address",
                            "TELEPHONE"     => "telephone",
                            "P BARCODE"     => "patron_barcode",
                            "PIN"           => "pin",
                            "HOLD"          => "hold",
                            "FINE"          => "fine",
                            "LINK REC"      => "linked_record"
  }

  @@patron_api_field_map_r = @@patron_api_field_map.invert


  def self.print_patron_dump(patron)
    PP.pp(patron)
  end


  def self.load_patron_dump(pnumber)

    url = 
URI.parse("https://#{PATRON_API_SERVER}:#{PATRON_API_PORT}/PATRONAPI/#{pnumber}/dump")
   p url
    req = Net::HTTP::Get.new(url.path)

    http = Net::HTTP.new(url.host, url.port)

    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    http.use_ssl = true

    res = http.start { |agent|
      agent.request(req)
    }
    
    patron_dump = Multimap.new

    res.body.split("\n").each do |line|
      # ruby doesn't support regex lookbehinds :(
      pos = line.index("]=")

      unless pos.nil? || pos > line.length
        data = line[pos+2..line.length][/(.+)(?=\<)/]
        pos = line.index("[")
        field = @@patron_api_field_map[line[0..line.index("[")-1]]
        field && patron_dump[field] = data
      end
    end

    patron_dump
  end
end


if __FILE__ == $0
  # $0 is barcode (or pnumber if prefixed with '.')
  PAPIWrapper.print_patron_dump(PAPIWrapper.load_patron_dump(ARGV[0]))
end

