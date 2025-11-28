#!/usr/bin/env python3
"""
Compare RISC Zero VK constants with our contract constants.
Converts decimal strings to little-endian hex for byte-for-byte comparison.
"""

# RISC Zero constants (from risc0-groth16-3.0.3/src/verifier.rs)
RISC0_CONSTANTS = {
    "ALPHA_X": "20491192805390485299153009773594534940189261866228447918068658471970481763042",
    "ALPHA_Y": "9383485363053290200918347156157836566562967994039712273449902621266178545958",
    "BETA_X1": "4252822878758300859123897981450591353533073413197771768651442665752259397132",
    "BETA_X2": "6375614351688725206403948262868962793625744043794305715222011528459656738731",
    "BETA_Y1": "21847035105528745403288232691147584728191162732299865338377159692350059136679",
    "BETA_Y2": "10505242626370262277552901082094356697409835680220590971873171140371331206856",
    "GAMMA_X1": "11559732032986387107991004021392285783925812861821192530917403151452391805634",
    "GAMMA_X2": "10857046999023057135944570762232829481370756359578518086990519993285655852781",
    "GAMMA_Y1": "4082367875863433681332203403145435568316851327593401208105741076214120093531",
    "GAMMA_Y2": "8495653923123431417604973247489272438418190587263600148770280649306958101930",
    "DELTA_X1": "1668323501672964604911431804142266013250380587483576094566949227275849579036",
    "DELTA_X2": "12043754404802191763554326994664886008979042643626290185762540825416902247219",
    "DELTA_Y1": "7710631539206257456743780535472368339139328733484942210876916214502466455394",
    "DELTA_Y2": "13740680757317479711909903993315946540841369848973133181051452051592786724563",
    "IC0_X": "8446592859352799428420270221449902464741693648963397251242447530457567083492",
    "IC0_Y": "1064796367193003797175961162477173481551615790032213185848276823815288302804",
    "IC1_X": "3179835575189816632597428042194253779818690147323192973511715175294048485951",
    "IC1_Y": "20895841676865356752879376687052266198216014795822152491318012491767775979074",
    "IC2_X": "5332723250224941161709478398807683311971555792614491788690328996478511465287",
    "IC2_Y": "21199491073419440416471372042641226693637837098357067793586556692319371762571",
    "IC3_X": "12457994489566736295787256452575216703923664299075106359829199968023158780583",
    "IC3_Y": "19706766271952591897761291684837117091856807401404423804318744964752784280790",
    "IC4_X": "19617808913178163826953378459323299110911217259216006187355745713323154132237",
    "IC4_Y": "21663537384585072695701846972542344484111393047775983928357046779215877070466",
    "IC5_X": "6834578911681792552110317589222010969491336870276623105249474534788043166867",
    "IC5_Y": "15060583660288623605191393599883223885678013570733629274538391874953353488393",
}

# Our contract constants (from contracts/zk-verifier/src/lib.rs)
OUR_CONSTANTS = {
    "ALPHA_G1_X": "e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2d",
    "ALPHA_G1_Y": "26194d00ffca76f0010323190a8389ce45e39f2060ecd861b0ce373c50ddbe14",
    "BETA_G2_X_C0": "abb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e",  # x real (X1)
    "BETA_G2_X_C1": "0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036709",  # x imaginary (X2)
    "BETA_G2_Y_C0": "c8ced07a54067fd5a905ea3ec6b796f892912f4dd2233131c7a857a4b1c13917",  # y real (Y1)
    "BETA_G2_Y_C1": "a74623114d9aa69d370d7a6bc4defdaa3c8c3fd947e8f5994a708ae0d1fb4c30",  # y imaginary (Y2)
    "GAMMA_G2_X_C0": "edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018",  # x real (X1)
    "GAMMA_G2_X_C1": "c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19",  # x imaginary (X2)
    "GAMMA_G2_Y_C0": "aa7dfa6601cce64c7bd3430c69e7d1e38f40cb8d8071ab4aeb6d8cdba55ec812",  # y real (Y1)
    "GAMMA_G2_Y_C1": "5b9722d1dcdaac55f38eb37033314bbc95330c69ad999eec75f05f58d0890609",  # y imaginary (Y2)
    "DELTA_G2_X_C0": "33033e7fea1f40604eaacf699d4be9aacc577054a0db22d9129a1728ff85a01a",  # x real (X1)
    "DELTA_G2_X_C1": "1c3af829b62bf4914c0bcf2c81a4bd577190eff5f194ee9bac95faefd53cb003",  # x imaginary (X2)
    "DELTA_G2_Y_C0": "d3c63f7d18df42711cea2f9ed5742d0b2d8318831767e837e857f7cb1ff3601e",  # y real (Y1)
    "DELTA_G2_Y_C1": "6207030d94d2915cca2872fb6e3668a8aec918d5460849f6190b204f13100c11",  # y imaginary (Y2)
    "IC0_X": "e43bdc655d0f9d730535554d9caa611ddd152c081a06a932a8e1d5dc259aac12",
    "IC0_Y": "d4ac80e90ec6232bee3e0fd3a2f56f106985891c913117d97abe1e5844a75a02",
    "IC1_X": "3f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b90707",
    "IC1_Y": "4266ff870765a482373803c25555d5d2ac8134f67b35bcf7549558b794a0322e",
    "IC2_X": "47c30f85444697fdf436e348711c011115963f855197243e4b39e6cbe236ca0b",
    "IC2_Y": "8b9bdffcb153c109f4f7b86dfad435842a4e71683dfa29373acf48cf9a7cde2e",
    "IC3_X": "a7f2042e11f9255afbb6c6e2c3accb88e401f2aac21c097c92b3fbdb99f98a1b",
    "IC3_Y": "d6cc9c674ff09c3e7f15601ad886d550c8812a199f9422576f1b2ea96aa2912b",
    "IC4_X": "0dcd6c075ada6ed0ddfece1d4a2d005f61a7d5df0b75c18a5b2374d64e495f2b",
    "IC4_Y": "825eadb26516e7c512f9148ff86fa7b863a8b9cb7f81bacbb9aa2020ad20e52f",
    "IC5_X": "93d4c4b1200394d5253cce2f25a59b862ee8e4cd43686603faa09d5d0d3c1c0f",
    "IC5_Y": "09e8690bbd01aa8782f608362fbbc88b2d4807b3070d8cfef625f474fffc4b21",
}

def decimal_to_little_endian_hex(decimal_str):
    """Convert decimal string to 32-byte little-endian hex"""
    # Convert to integer
    num = int(decimal_str)
    # Convert to 32-byte big-endian bytes
    big_endian_bytes = num.to_bytes(32, byteorder='big')
    # Reverse to little-endian
    little_endian_bytes = bytes(reversed(big_endian_bytes))
    # Convert to hex string
    return little_endian_bytes.hex()

def compare_constants():
    """Compare RISC Zero constants with our constants"""

    print("=" * 80)
    print("VK CONSTANT COMPARISON: RISC Zero vs Our Contract")
    print("=" * 80)
    print()

    # Mapping between RISC Zero names and our names
    mappings = [
        ("ALPHA_X", "ALPHA_G1_X"),
        ("ALPHA_Y", "ALPHA_G1_Y"),
        ("BETA_X1", "BETA_G2_X_C0"),   # X1 = real = c0
        ("BETA_X2", "BETA_G2_X_C1"),   # X2 = imaginary = c1
        ("BETA_Y1", "BETA_G2_Y_C0"),   # Y1 = real = c0
        ("BETA_Y2", "BETA_G2_Y_C1"),   # Y2 = imaginary = c1
        ("GAMMA_X1", "GAMMA_G2_X_C0"),
        ("GAMMA_X2", "GAMMA_G2_X_C1"),
        ("GAMMA_Y1", "GAMMA_G2_Y_C0"),
        ("GAMMA_Y2", "GAMMA_G2_Y_C1"),
        ("DELTA_X1", "DELTA_G2_X_C0"),
        ("DELTA_X2", "DELTA_G2_X_C1"),
        ("DELTA_Y1", "DELTA_G2_Y_C0"),
        ("DELTA_Y2", "DELTA_G2_Y_C1"),
        ("IC0_X", "IC0_X"),
        ("IC0_Y", "IC0_Y"),
        ("IC1_X", "IC1_X"),
        ("IC1_Y", "IC1_Y"),
        ("IC2_X", "IC2_X"),
        ("IC2_Y", "IC2_Y"),
        ("IC3_X", "IC3_X"),
        ("IC3_Y", "IC3_Y"),
        ("IC4_X", "IC4_X"),
        ("IC4_Y", "IC4_Y"),
        ("IC5_X", "IC5_X"),
        ("IC5_Y", "IC5_Y"),
    ]

    all_match = True
    mismatches = []

    for risc0_name, our_name in mappings:
        # Convert RISC Zero decimal to little-endian hex
        risc0_hex = decimal_to_little_endian_hex(RISC0_CONSTANTS[risc0_name])
        our_hex = OUR_CONSTANTS[our_name]

        match = risc0_hex == our_hex
        symbol = "✅" if match else "❌"

        print(f"{symbol} {risc0_name:15} -> {our_name:15}")
        if not match:
            all_match = False
            mismatches.append((risc0_name, our_name, risc0_hex, our_hex))
            print(f"   RISC Zero: {risc0_hex}")
            print(f"   Our value: {our_hex}")
            print()

    print()
    print("=" * 80)
    if all_match:
        print("✅ ALL VK CONSTANTS MATCH RISC ZERO BYTE-FOR-BYTE!")
        print("=" * 80)
        print()
        print("This confirms our VK constants are correct.")
        print("The pairing failure must be caused by something else:")
        print("  - Public input computation from journal")
        print("  - Pairing pair ordering/negation")
        print("  - Point parsing from receipt")
        return 0
    else:
        print(f"❌ FOUND {len(mismatches)} MISMATCHES!")
        print("=" * 80)
        print()
        print("DETAILED MISMATCHES:")
        print()
        for risc0_name, our_name, risc0_hex, our_hex in mismatches:
            print(f"{risc0_name} -> {our_name}:")
            print(f"  Expected (RISC Zero): {risc0_hex}")
            print(f"  Actual (Our):         {our_hex}")
            print()
        return 1

if __name__ == "__main__":
    exit(compare_constants())
